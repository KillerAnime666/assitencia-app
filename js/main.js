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

// Cargar lista de estudiantes con diseño de botones cómodos
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
            
            // Diseño de botones segmentados para máxima comodidad
            tr.innerHTML = `
                <td class="p-4 font-bold text-slate-700 dark:text-slate-200 text-sm">${s.name}</td>
                <td class="p-2 text-center">
                    <label class="cursor-pointer inline-block">
                        <input type="radio" name="${d.id}" value="present" class="hidden peer">
                        <div class="w-10 h-10 flex items-center justify-center rounded-xl border-2 border-transparent bg-slate-100 dark:bg-slate-700 text-slate-400 peer-checked:bg-green-500 peer-checked:text-white peer-checked:border-green-600 transition-all shadow-sm active:scale-90">
                            <span class="font-black text-xs">P</span>
                        </div>
                    </label>
                </td>
                <td class="p-2 text-center">
                    <label class="cursor-pointer inline-block">
                        <input type="radio" name="${d.id}" value="absent" class="hidden peer">
                        <div class="w-10 h-10 flex items-center justify-center rounded-xl border-2 border-transparent bg-slate-100 dark:bg-slate-700 text-slate-400 peer-checked:bg-red-500 peer-checked:text-white peer-checked:border-red-600 transition-all shadow-sm active:scale-90">
                            <span class="font-black text-xs">F</span>
                        </div>
                    </label>
                </td>
                <td class="p-2 text-center">
                    <label class="cursor-pointer inline-block">
                        <input type="radio" name="${d.id}" value="permission" class="hidden peer">
                        <div class="w-10 h-10 flex items-center justify-center rounded-xl border-2 border-transparent bg-slate-100 dark:bg-slate-700 text-slate-400 peer-checked:bg-[#940bf5] peer-checked:text-white peer-checked:border-[#7a09c9] transition-all shadow-sm active:scale-90">
                            <span class="font-black text-xs">L</span>
                        </div>
                    </label>
                </td>
                <td class="p-2 text-center">
                    <button class="w-8 h-8 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all text-xl delete-btn">×</button>
                </td>
            `;
            tr.querySelector(".delete-btn").onclick = () => confirmDelete(d.id, s.name);
            studentsBody.appendChild(tr);
        });
        updateCounter();
    } catch (e) { console.error("Error al cargar estudiantes:", e); }
}

// Actualizar el contador de alumnos marcados
function updateCounter() {
    if (!counterEl || !studentsBody) return;
    const total = studentsBody.querySelectorAll("tr").length;
    const marked = studentsBody.querySelectorAll("input:checked").length;
    counterEl.innerText = `Marcados: ${marked}/${total}`;
    counterEl.className = marked === total ? "text-green-600 font-bold text-xs" : "text-amber-600 text-xs";
}

// Guardar asistencia usando Batch (Atómico)
async function saveAttendance() {
    const rows = studentsBody.querySelectorAll("tr");
    const date = dateInput.value;
    const batch = writeBatch(db);
    let count = 0;

    rows.forEach(row => {
        const status = row.querySelector("input:checked")?.value;
        if (status) {
            // ID compuesto: ID_ESTUDIANTE + FECHA para evitar duplicados el mismo día
            const ref = doc(db, "attendance", `${row.dataset.id}_${date}`);
            batch.set(ref, {
                studentId: row.dataset.id, 
                nombre: row.cells[0].innerText, 
                estado: status, 
                fecha: date,
                timestamp: new Date()
            });
            count++;
        }
    });

    if (count === 0) return Swal.fire("Atención", "Marca al menos a un estudiante", "warning");

    try {
        await batch.commit();
        Swal.fire({ icon: 'success', title: 'Asistencia Guardada', text: `Se registraron ${count} estudiantes para el ${date}`, timer: 2000 });
    } catch (e) { Swal.fire("Error", "No se pudo guardar en la base de datos", "error"); }
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