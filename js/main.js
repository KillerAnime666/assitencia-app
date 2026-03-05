import { db, auth } from "./firebase.js";
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import { collection, getDocs, addDoc, deleteDoc, doc, query, orderBy, writeBatch, where } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

// --- 1. CONFIGURACIÓN INICIAL DEL TEMA (EVITAR PARPADEO) ---
const htmlElement = document.documentElement;
if (localStorage.getItem("theme") === "dark") {
    htmlElement.classList.add("dark");
}

// --- 2. REFERENCIAS AL DOM ---
const studentsBody = document.getElementById("studentsBody");
const searchInput = document.getElementById("searchStudent");
const dateInput = document.getElementById("attendanceDate");
const counterEl = document.getElementById("attendanceCounter");
const loginBtn = document.getElementById("loginBtn");
const darkIcon = document.getElementById("darkIcon");

// --- 3. ESTABLECER FECHA ACTUAL POR DEFECTO ---
const setTodayDate = () => {
    const hoy = new Date();
    const offset = hoy.getTimezoneOffset();
    const fechaLocal = new Date(hoy.getTime() - (offset * 60 * 1000)).toISOString().split('T')[0];
    if (dateInput) dateInput.value = fechaLocal;
};
setTodayDate();

// --- 4. SEGURIDAD: CERRAR SESIÓN AL RECARGAR (F5) ---
window.addEventListener('load', () => {
    if (darkIcon) darkIcon.innerText = htmlElement.classList.contains("dark") ? "☀️" : "🌙";
    
    const navEntries = performance.getEntriesByType("navigation");
    if (navEntries.length > 0 && navEntries[0].type === "reload") {
        signOut(auth);
    }
});

// --- 5. OBSERVADOR DE SESIÓN (MANEJO DE INTERFAZ) ---
onAuthStateChanged(auth, (user) => {
    const loginSection = document.getElementById("loginSection");
    const mainContent = document.getElementById("mainContent");

    if (user) {
        if(loginSection) loginSection.classList.add("hidden");
        if(mainContent) mainContent.classList.remove("hidden");
        loadStudents(); 
    } else {
        if(loginSection) loginSection.classList.remove("hidden");
        if(mainContent) mainContent.classList.add("hidden");
    }
});

// --- 6. FUNCIONES CORE ---

// 1. Al cargar la lista de estudiantes, ahora también verificamos la asistencia
async function loadStudents() {
    if (!studentsBody) return;
    studentsBody.innerHTML = "<tr><td colspan='5' class='p-10 text-center text-slate-400 italic animate-pulse'>Sincronizando datos...</td></tr>";
    
    try {
        const q = query(collection(db, "students"), orderBy("name", "asc"));
        const snapshot = await getDocs(q);
        studentsBody.innerHTML = "";

        snapshot.forEach(d => {
            const s = d.data();
            const tr = document.createElement("tr");
            tr.dataset.id = d.id;
            tr.className = "hover:bg-gray-50 dark:hover:bg-slate-700/30 transition border-b dark:border-slate-700";
            
            tr.innerHTML = `
                <td class="p-4 font-bold text-slate-700 dark:text-slate-200 text-sm">${s.name}</td>
                <td class="p-2 text-center">
                    <label class="cursor-pointer inline-block">
                        <input type="radio" name="${d.id}" value="present" class="hidden peer">
                        <div class="w-10 h-10 flex items-center justify-center rounded-xl border-2 border-transparent bg-slate-100 dark:bg-slate-700 text-slate-400 peer-checked:bg-green-500 peer-checked:text-white peer-checked:border-green-600 transition-all shadow-sm active:scale-90">P</div>
                    </label>
                </td>
                <td class="p-2 text-center">
                    <label class="cursor-pointer inline-block">
                        <input type="radio" name="${d.id}" value="absent" class="hidden peer">
                        <div class="w-10 h-10 flex items-center justify-center rounded-xl border-2 border-transparent bg-slate-100 dark:bg-slate-700 text-slate-400 peer-checked:bg-red-500 peer-checked:text-white peer-checked:border-red-600 transition-all shadow-sm active:scale-90">F</div>
                    </label>
                </td>
                <td class="p-2 text-center">
                    <label class="cursor-pointer inline-block">
                        <input type="radio" name="${d.id}" value="permission" class="hidden peer">
                        <div class="w-10 h-10 flex items-center justify-center rounded-xl border-2 border-transparent bg-slate-100 dark:bg-slate-700 text-slate-400 peer-checked:bg-[#940bf5] peer-checked:text-white peer-checked:border-[#7a09c9] transition-all shadow-sm active:scale-90">EJ</div>
                    </label>
                </td>
                <td class="p-2 text-center">
                    <button class="w-8 h-8 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all text-xl delete-btn">×</button>
                </td>
            `;
            tr.querySelector(".delete-btn").onclick = () => confirmDelete(d.id, s.name);
            studentsBody.appendChild(tr);
        });

        // ¡NUEVO! Después de cargar los alumnos, buscamos si ya hay asistencia para la fecha seleccionada
        checkExistingAttendance();

    } catch (e) { console.error("Error al cargar estudiantes:", e); }
}

// 2. NUEVA FUNCIÓN: Buscar asistencia guardada para la fecha actual
async function checkExistingAttendance() {
    const selectedDate = dateInput.value;
    if (!selectedDate) return;

    // Resetear todos los radios antes de marcar los nuevos
    document.querySelectorAll('input[type="radio"]').forEach(radio => radio.checked = false);

    try {
        const q = query(collection(db, "attendance"), where("fecha", "==", selectedDate));
        const querySnapshot = await getDocs(q);

        querySnapshot.forEach((doc) => {
            const data = doc.data();
            // Buscamos el radio button específico por el name (ID del alumno) y el value (estado)
            const radioToMark = document.querySelector(`input[name="${data.studentId}"][value="${data.estado}"]`);
            if (radioToMark) {
                radioToMark.checked = true;
            }
        });
        updateCounter(); // Actualizar el contador de marcados
    } catch (e) {
        console.error("Error al recuperar asistencia:", e);
    }
}

// 3. EVENTO: Cuando el usuario cambia la fecha en el calendario
dateInput.onchange = () => {
    checkExistingAttendance();
};

// Actualizar el contador de alumnos marcados
function updateCounter() {
    if (!counterEl || !studentsBody) return;
    const total = studentsBody.querySelectorAll("tr").length;
    const marked = studentsBody.querySelectorAll("input:checked").length;
    counterEl.innerText = `Marcados: ${marked}/${total}`;
    counterEl.className = marked === total ? "text-green-600 font-bold text-xs" : "text-amber-600 text-xs";
}

// Guardar asistencia usando Batch (Atómico)
// --- Reemplaza tu función saveAttendance por esta versión optimizada ---
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
            // USAMOS SIEMPRE ESTE ID ÚNICO: Previene duplicados por diseño.
            const docId = `${studentId}_${date}`;
            const ref = doc(db, "attendance", docId);
            
            batch.set(ref, {
                studentId: studentId,
                nombre: nombre,
                estado: status,
                fecha: date,
                lastUpdated: new Date() // Cambiamos timestamp por lastUpdated para mayor claridad
            });
            count++;
        }
    });

    if (count === 0) return Swal.fire("Atención", "No hay cambios para guardar", "info");

    try {
        await batch.commit();
        Swal.fire({
            icon: 'success',
            title: 'Sincronizado',
            text: `Se actualizaron ${count} registros para el día ${date}`,
            timer: 1500,
            showConfirmButton: false
        });
        updateCounter();
    } catch (e) {
        console.error("Error al guardar:", e);
        Swal.fire("Error", "No se pudo conectar con la base de datos", "error");
    }
}

// Exportar Reporte Excel Detallado (Resumen + Historial)
async function exportToExcel() {
    Swal.fire({ title: 'Generando Excel...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    
    try {
        const studentsSnap = await getDocs(collection(db, "students"));
        const attendanceSnap = await getDocs(collection(db, "attendance"));
        const students = studentsSnap.docs.map(d => ({id: d.id, name: d.data().name}));
        const attendance = attendanceSnap.docs.map(d => d.data());

        // Hoja 1: Resumen de totales
        const summaryData = students.map(s => {
            const r = attendance.filter(a => a.studentId === s.id);
            const present = r.filter(x => x.estado === "present").length;
            const total = r.length;
            return {
                "Estudiante": s.name,
                "✅ Asistencias": present,
                "❌ Faltas": r.filter(x => x.estado === "absent").length,
                "🆔 Permisos": r.filter(x => x.estado === "permission").length,
                "Total Días": total,
                "% Asistencia": total > 0 ? ((present / total) * 100).toFixed(1) + "%" : "0%"
            };
        });

        // Hoja 2: Historial diario completo
        const historyData = attendance.map(a => ({
            "Fecha": a.fecha,
            "Estudiante": a.nombre,
            "Estado": a.estado === 'present' ? 'Asistió' : a.estado === 'absent' ? 'Faltó' : 'Licencia'
        })).sort((a,b) => b.Fecha.localeCompare(a.Fecha));

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryData), "Resumen General");
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(historyData), "Historial de Días");
        XLSX.writeFile(wb, `Reporte_Asistencia_${dateInput.value}.xlsx`);
        Swal.close();
    } catch (e) {
        Swal.fire("Error", "Hubo un problema al generar el archivo", "error");
    }
}

// Borrar estudiante
async function confirmDelete(id, name) {
    const r = await Swal.fire({
        title: `¿Borrar a ${name}?`,
        text: "Se perderán sus registros de asistencia.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        confirmButtonText: 'Sí, eliminar'
    });
    if (r.isConfirmed) { 
        await deleteDoc(doc(db, "students", id)); 
        loadStudents(); 
    }
}

// --- 7. LISTENERS DE EVENTOS ---

// Delegación de clic para Login y Modo Oscuro
document.addEventListener('click', async (e) => {
    // Botón Login
    if (e.target.id === "loginBtn") {
        const email = document.getElementById("email").value.trim();
        const pass = document.getElementById("password").value.trim();
        if (!email || !pass) return Swal.fire("Campos vacíos", "Completa los datos", "warning");
        try {
            e.target.disabled = true; e.target.innerText = "Verificando...";
            await signInWithEmailAndPassword(auth, email, pass);
        } catch (error) {
            Swal.fire("Error", "Usuario o clave incorrectos", "error");
            e.target.disabled = false; e.target.innerText = "Entrar al Sistema";
        }
    }

    // Botón Modo Oscuro
    if (e.target.closest("#darkModeToggle")) {
        const isDark = htmlElement.classList.toggle("dark");
        localStorage.setItem("theme", isDark ? "dark" : "light");
        if (darkIcon) darkIcon.innerText = isDark ? "☀️" : "🌙";
    }
});

// Botón añadir estudiante (con validación de duplicados)
document.getElementById("addStudentBtn").onclick = async () => {
    const name = document.getElementById("newStudentName").value.trim();
    if (!name) return;
    
    const check = await getDocs(query(collection(db, "students"), where("name", "==", name)));
    if (!check.empty) return Swal.fire("Atención", "Este nombre ya está en la lista", "warning");

    await addDoc(collection(db, "students"), { name });
    document.getElementById("newStudentName").value = "";
    loadStudents();
};

// Buscador dinámico
searchInput.oninput = (e) => {
    const val = e.target.value.toLowerCase();
    studentsBody.querySelectorAll("tr").forEach(tr => {
        tr.style.display = tr.cells[0].innerText.toLowerCase().includes(val) ? "" : "none";
    });
};

// Eventos de botones inferiores
document.getElementById("saveAttendanceBtn").onclick = saveAttendance;
document.getElementById("exportExcelBtn").onclick = exportToExcel;
document.getElementById("logoutBtn").onclick = () => signOut(auth);

document.getElementById("markAllPresent").onclick = () => {
    document.querySelectorAll('input[value="present"]').forEach(i => i.checked = true);
    updateCounter();
};

// Actualizar contador cuando se marque cualquier radio
studentsBody.addEventListener('change', (e) => {
    if (e.target.type === "radio") updateCounter();
});