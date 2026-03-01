import { db, auth } from "./firebase.js";
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import { collection, getDocs, addDoc, deleteDoc, doc, query, orderBy, writeBatch } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

// --- LÓGICA DE SEGURIDAD INTELIGENTE ---
window.addEventListener('load', async () => {
    // Detectamos el tipo de navegación
    const navEntries = performance.getEntriesByType("navigation");
    const navType = navEntries.length > 0 ? navEntries[0].type : "";

    // SOLO cerramos sesión si es una RECARGA (F5)
    // Si el tipo es "navigate" (venimos de un link), NO cerramos sesión
    if (navType === "reload") {
        await signOut(auth);
        console.log("Sesión cerrada por recarga de página.");
    }
});

const studentsBody = document.getElementById("studentsBody");
const searchInput = document.getElementById("searchStudent");
const dateInput = document.getElementById("attendanceDate");

// El resto de tu lógica de onAuthStateChanged
onAuthStateChanged(auth, (user) => {
  if (user) {
    document.getElementById("loginSection").classList.add("hidden");
    document.getElementById("mainContent").classList.remove("hidden");
    loadStudents();
  } else {
    document.getElementById("loginSection").classList.remove("hidden");
    document.getElementById("mainContent").classList.add("hidden");
    // Si no hay usuario y estamos en otra página, esto no hará nada, 
    // pero en index.html mostrará el login.
  }
});

// Inicializar fecha
dateInput.value = new Date().toISOString().split('T')[0];

// --- SEGURIDAD ---
onAuthStateChanged(auth, (user) => {
    if (user) {
        document.getElementById("loginSection").classList.add("hidden");
        document.getElementById("mainContent").classList.remove("hidden");
        loadStudents();
    } else {
        document.getElementById("loginSection").classList.remove("hidden");
        document.getElementById("mainContent").classList.add("hidden");
    }
});

// --- FUNCIONES ---
async function loadStudents() {
    studentsBody.innerHTML = "<tr><td colspan='5' class='p-10 text-center text-gray-400'>Cargando lista...</td></tr>";
    const q = query(collection(db, "students"), orderBy("name", "asc"));
    const snapshot = await getDocs(q);
    studentsBody.innerHTML = "";

    snapshot.forEach(d => {
        const s = d.data();
        const tr = document.createElement("tr");
        tr.dataset.id = d.id;
        tr.className = "hover:bg-gray-50 transition";
        tr.innerHTML = `
            <td class="p-4 font-semibold">${s.name}</td>
            <td class="p-4 text-center"><input type="radio" name="${d.id}" value="present" class="w-4 h-4 text-blue-600"></td>
            <td class="p-4 text-center"><input type="radio" name="${d.id}" value="absent" class="w-4 h-4 text-red-600"></td>
            <td class="p-4 text-center"><input type="radio" name="${d.id}" value="permission" class="w-4 h-4 text-amber-500"></td>
            <td class="p-4 text-center text-red-500 cursor-pointer delete-btn">✖</td>
        `;
        tr.querySelector(".delete-btn").onclick = () => confirmDelete(d.id, s.name);
        studentsBody.appendChild(tr);
    });
}

async function saveAttendance() {
    const rows = studentsBody.querySelectorAll("tr");
    const date = dateInput.value;
    const batch = writeBatch(db);
    let count = 0;

    rows.forEach(row => {
        const studentId = row.dataset.id;
        const nombre = row.cells[0].innerText;
        const status = row.querySelector("input:checked")?.value;

        if (status) {
            // ID Compuesto para evitar duplicados por día
            const ref = doc(db, "attendance", `${studentId}_${date}`);
            batch.set(ref, { studentId, nombre, estado: status, fecha: date, timestamp: new Date() });
            count++;
        }
    });

    if (count === 0) return Swal.fire("Atención", "Marca al menos un estudiante", "warning");

    await batch.commit();
    Swal.fire("¡Éxito!", `Asistencia del ${date} guardada.`, "success");
}

async function confirmDelete(id, name) {
    const result = await Swal.fire({
        title: `¿Eliminar a ${name}?`,
        text: "Esta acción no se puede deshacer.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        confirmButtonText: 'Sí, borrar'
    });

    if (result.isConfirmed) {
        await deleteDoc(doc(db, "students", id));
        loadStudents();
    }
}

async function exportAttendanceToExcel() {
    try {
        // 1. Mostrar alerta de "Procesando" (Cortesía de SweetAlert2)
        Swal.fire({
            title: 'Generando reporte...',
            text: 'Estamos procesando el desglose de cada estudiante.',
            allowOutsideClick: false,
            didOpen: () => { Swal.showLoading(); }
        });

        // 2. Obtener datos de Firebase
        const studentsSnap = await getDocs(collection(db, "students"));
        const attendanceSnap = await getDocs(collection(db, "attendance"));

        const allStudents = studentsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const allAttendance = attendanceSnap.docs.map(doc => doc.data());

        // 3. Crear el desglose por cada estudiante
        const excelData = allStudents.map(student => {
            // Filtrar las asistencias que pertenecen a este estudiante
            const records = allAttendance.filter(record => record.studentId === student.id);
            
            const present = records.filter(r => r.estado === "present").length;
            const absent = records.filter(r => r.estado === "absent").length;
            const permission = records.filter(r => r.estado === "permission").length;
            const total = records.length;

            // Calcular porcentaje de asistencia (Evitando división por cero)
            const percentage = total > 0 ? ((present / total) * 100).toFixed(1) + "%" : "0%";

            return {
                "Nombre del Estudiante": student.name,
                "✅ Presentes": present,
                "❌ Faltas": absent,
                "🆔 Permisos": permission,
                "📅 Total Días Registrados": total,
                "📊 % de Asistencia": percentage
            };
        });

        // 4. Crear el archivo Excel con SheetJS
        const worksheet = XLSX.utils.json_to_sheet(excelData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Resumen de Asistencia");

        // Ajustar el ancho de las columnas (opcional pero profesional)
        const wscols = [
            {wch: 30}, // Nombre
            {wch: 12}, // Presentes
            {wch: 12}, // Faltas
            {wch: 12}, // Permisos
            {wch: 25}, // Total Días
            {wch: 15}  // Porcentaje
        ];
        worksheet['!cols'] = wscols;

        // 5. Descargar el archivo
        const fileName = `Reporte_Asistencia_${new Date().toISOString().split('T')[0]}.xlsx`;
        XLSX.writeFile(workbook, fileName);

        Swal.close();
        Swal.fire("¡Listo!", "Tu reporte se ha descargado correctamente.", "success");

    } catch (error) {
        console.error("Error al exportar:", error);
        Swal.fire("Error", "No se pudo generar el Excel.", "error");
    }
}
document.getElementById("exportExcelBtn").addEventListener("click", exportAttendanceToExcel);

// --- EVENTOS ---
document.getElementById("loginBtn").onclick = async () => {
    const email = document.getElementById("email").value;
    const pass = document.getElementById("password").value;
    try { await signInWithEmailAndPassword(auth, email, pass); } 
    catch (e) { Swal.fire("Error", "Credenciales incorrectas", "error"); }
};

document.getElementById("logoutBtn").onclick = () => signOut(auth);
document.getElementById("saveAttendanceBtn").onclick = saveAttendance;
document.getElementById("addStudentBtn").onclick = async () => {
    const name = document.getElementById("newStudentName").value.trim();
    if (name) {
        await addDoc(collection(db, "students"), { name });
        document.getElementById("newStudentName").value = "";
        loadStudents();
    }
};

// Buscador
searchInput.oninput = (e) => {
    const val = e.target.value.toLowerCase();
    studentsBody.querySelectorAll("tr").forEach(tr => {
        tr.style.display = tr.cells[0].innerText.toLowerCase().includes(val) ? "" : "none";
    });
};

// Exportar Excel
document.getElementById("exportExcelBtn").onclick = async () => {
    const snap = await getDocs(collection(db, "attendance"));
    const data = snap.docs.map(d => d.data());
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, ws, "Asistencia");
    XLSX.writeFile(wb, `Reporte_Asistencia_${dateInput.value}.xlsx`);
};

document.getElementById("markAllPresent").onclick = () => {
    studentsBody.querySelectorAll('input[value="present"]').forEach(i => i.checked = true);
};