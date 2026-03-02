import { db, auth } from "./firebase.js";
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import { collection, getDocs, addDoc, deleteDoc, doc, query, orderBy, writeBatch } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

const studentsBody = document.getElementById("studentsBody");
const searchInput = document.getElementById("searchStudent");
const dateInput = document.getElementById("attendanceDate");
const darkIcon = document.getElementById("darkIcon");
const htmlElement = document.documentElement;

// --- LÓGICA DE NAVEGACIÓN INTELIGENTE ---
window.addEventListener('load', async () => {
    const navEntries = performance.getEntriesByType("navigation");
    const navType = navEntries.length > 0 ? navEntries[0].type : "";
    
    if (navType === "reload") {
        await signOut(auth);
    }
});

// Inicializar tema guardado
if (localStorage.getItem("theme") === "dark") {
    htmlElement.classList.add("dark");
    if(darkIcon) darkIcon.innerText = "☀️";
}

// Inicializar fecha
dateInput.value = new Date().toISOString().split('T')[0];

// --- SEGURIDAD ÚNICA ---
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
        tr.className = "hover:bg-gray-50 dark:hover:bg-slate-700/50 transition";
        tr.innerHTML = `
            <td class="p-4 font-semibold text-slate-700 dark:text-slate-200">${s.name}</td>
            <td class="p-4 text-center"><input type="radio" name="${d.id}" value="present" class="accent-green-500 w-4 h-4 cursor-pointer"></td>
            <td class="p-4 text-center"><input type="radio" name="${d.id}" value="absent" class="accent-red-500 w-4 h-4 cursor-pointer"></td>
            <td class="p-4 text-center"><input type="radio" name="${d.id}" value="permission" class="accent-[#940bf5] w-4 h-4 cursor-pointer"></td>
            <td class="p-4 text-center text-red-500 cursor-pointer delete-btn">✖</td>
        `;
        tr.querySelector(".delete-btn").onclick = () => confirmDelete(d.id, s.name);
        studentsBody.appendChild(tr);
    });
}

async function exportAttendanceToExcel() {
    try {
        Swal.fire({ title: 'Generando reporte...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

        const studentsSnap = await getDocs(collection(db, "students"));
        const attendanceSnap = await getDocs(collection(db, "attendance"));

        const allStudents = studentsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const allAttendance = attendanceSnap.docs.map(doc => doc.data());

        const excelData = allStudents.map(student => {
            const records = allAttendance.filter(r => r.studentId === student.id);
            const present = records.filter(r => r.estado === "present").length;
            const absent = records.filter(r => r.estado === "absent").length;
            const permission = records.filter(r => r.estado === "permission").length;
            const total = records.length;
            const percentage = total > 0 ? ((present / total) * 100).toFixed(1) + "%" : "0%";

            return {
                "Nombre del Estudiante": student.name,
                "✅ Presentes": present,
                "❌ Faltas": absent,
                "🆔 Permisos": permission,
                "📅 Total Días": total,
                "📊 % Asistencia": percentage
            };
        });

        const ws = XLSX.utils.json_to_sheet(excelData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Resumen");
        XLSX.writeFile(wb, `Reporte_Asistencia_${new Date().toISOString().split('T')[0]}.xlsx`);

        Swal.close();
        Swal.fire("¡Listo!", "Reporte descargado.", "success");
    } catch (e) {
        Swal.fire("Error", "No se pudo generar el Excel.", "error");
    }
}

// --- EVENTOS ---
document.getElementById("loginBtn").onclick = async () => {
    const email = document.getElementById("email").value;
    const pass = document.getElementById("password").value;
    try { await signInWithEmailAndPassword(auth, email, pass); } 
    catch (e) { Swal.fire("Error", "Credenciales incorrectas", "error"); }
};

document.getElementById("exportExcelBtn").onclick = exportAttendanceToExcel;
document.getElementById("logoutBtn").onclick = () => signOut(auth);

document.getElementById("darkModeToggle").onclick = () => {
    htmlElement.classList.toggle("dark");
    const isDark = htmlElement.classList.contains("dark");
    darkIcon.innerText = isDark ? "☀️" : "🌙";
    localStorage.setItem("theme", isDark ? "dark" : "light");
};

// Buscador
searchInput.oninput = (e) => {
    const val = e.target.value.toLowerCase();
    studentsBody.querySelectorAll("tr").forEach(tr => {
        tr.style.display = tr.cells[0].innerText.toLowerCase().includes(val) ? "" : "none";
    });
};

document.getElementById("saveAttendanceBtn").onclick = async () => {
    const rows = studentsBody.querySelectorAll("tr");
    const date = dateInput.value;
    const batch = writeBatch(db);
    rows.forEach(row => {
        const status = row.querySelector("input:checked")?.value;
        if (status) {
            const ref = doc(db, "attendance", `${row.dataset.id}_${date}`);
            batch.set(ref, { studentId: row.dataset.id, nombre: row.cells[0].innerText, estado: status, fecha: date });
        }
    });
    await batch.commit();
    Swal.fire("Éxito", "Asistencia guardada.", "success");
};

document.getElementById("markAllPresent").onclick = () => {
    studentsBody.querySelectorAll('input[value="present"]').forEach(i => i.checked = true);
};

document.getElementById("addStudentBtn").onclick = async () => {
    const name = document.getElementById("newStudentName").value.trim();
    if (name) {
        await addDoc(collection(db, "students"), { name });
        document.getElementById("newStudentName").value = "";
        loadStudents();
    }
};