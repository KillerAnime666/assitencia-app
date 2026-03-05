import { db, auth } from "./firebase.js";
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import { collection, getDocs, addDoc, deleteDoc, doc, query, orderBy, writeBatch, where } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

// --- 1. CONFIGURACIÓN INICIAL DEL TEMA ---
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

// --- 3. CONFIGURACIÓN DE NOTIFICACIONES TOAST ---
const Toast = Swal.mixin({
    toast: true,
    position: 'top-end',
    showConfirmButton: false,
    timer: 2500,
    timerProgressBar: true,
    didOpen: (toast) => {
        toast.addEventListener('mouseenter', Swal.stopTimer);
        toast.addEventListener('mouseleave', Swal.resumeTimer);
    }
});

// --- 4. ESTABLECER FECHA ACTUAL LOCAL ---
const setTodayDate = () => {
    const hoy = new Date();
    const offset = hoy.getTimezoneOffset();
    const fechaLocal = new Date(hoy.getTime() - (offset * 60 * 1000)).toISOString().split('T')[0];
    if (dateInput) dateInput.value = fechaLocal;
};
setTodayDate();

// --- 5. SEGURIDAD: CERRAR SESIÓN AL RECARGAR (F5) ---
window.addEventListener('load', () => {
    if (darkIcon) darkIcon.innerText = htmlElement.classList.contains("dark") ? "☀️" : "🌙";
    
    const navEntries = performance.getEntriesByType("navigation");
    if (navEntries.length > 0 && navEntries[0].type === "reload") {
        signOut(auth);
    }
});

// --- 6. OBSERVADOR DE SESIÓN ---
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

// --- 7. FUNCIONES DE CARGA Y RENDERIZADO ---

// Skeleton Screen para la carga
function renderTableSkeletons(count = 6) {
    if (!studentsBody) return;
    studentsBody.innerHTML = "";
    for (let i = 0; i < count; i++) {
        const tr = document.createElement("tr");
        tr.className = "animate-pulse border-b dark:border-slate-800";
        tr.innerHTML = `
            <td class="p-4"><div class="h-4 bg-slate-200 dark:bg-slate-700 rounded w-3/4"></div></td>
            <td class="p-2 text-center"><div class="w-10 h-10 mx-auto bg-slate-200 dark:bg-slate-700 rounded-xl"></div></td>
            <td class="p-2 text-center"><div class="w-10 h-10 mx-auto bg-slate-200 dark:bg-slate-700 rounded-xl"></div></td>
            <td class="p-2 text-center"><div class="w-10 h-10 mx-auto bg-slate-200 dark:bg-slate-700 rounded-xl"></div></td>
            <td class="p-2 text-center"><div class="w-6 h-6 mx-auto bg-slate-200 dark:bg-slate-700 rounded-md"></div></td>
        `;
        studentsBody.appendChild(tr);
    }
}

// Carga principal de estudiantes
async function loadStudents() {
    if (!studentsBody) return;
    renderTableSkeletons();
    
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
                        <div class="w-10 h-10 flex items-center justify-center rounded-xl border-2 border-transparent bg-slate-100 dark:bg-slate-700 text-slate-400 peer-checked:bg-green-500 peer-checked:text-white peer-checked:border-green-600 transition-all shadow-sm active:scale-90 font-black text-xs">P</div>
                    </label>
                </td>
                <td class="p-2 text-center">
                    <label class="cursor-pointer inline-block">
                        <input type="radio" name="${d.id}" value="absent" class="hidden peer">
                        <div class="w-10 h-10 flex items-center justify-center rounded-xl border-2 border-transparent bg-slate-100 dark:bg-slate-700 text-slate-400 peer-checked:bg-red-500 peer-checked:text-white peer-checked:border-red-600 transition-all shadow-sm active:scale-90 font-black text-xs">F</div>
                    </label>
                </td>
                <td class="p-2 text-center">
                    <label class="cursor-pointer inline-block">
                        <input type="radio" name="${d.id}" value="permission" class="hidden peer">
                        <div class="w-10 h-10 flex items-center justify-center rounded-xl border-2 border-transparent bg-slate-100 dark:bg-slate-700 text-slate-400 peer-checked:bg-[#940bf5] peer-checked:text-white peer-checked:border-[#7a09c9] transition-all shadow-sm active:scale-90 font-black text-xs">EJ</div>
                    </label>
                </td>
                <td class="p-2 text-center">
                    <button class="w-8 h-8 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all text-xl delete-btn">×</button>
                </td>
            `;
            tr.querySelector(".delete-btn").onclick = () => confirmDelete(d.id, s.name);
            studentsBody.appendChild(tr);
        });

        checkExistingAttendance(); 

    } catch (e) { 
        console.error("Error:", e);
        studentsBody.innerHTML = "<tr><td colspan='5' class='p-10 text-center text-red-400'>Error de conexión</td></tr>";
    }
}

// Verifica asistencia existente para edición
async function checkExistingAttendance() {
    const selectedDate = dateInput.value;
    if (!selectedDate) return;

    document.querySelectorAll('input[type="radio"]').forEach(radio => radio.checked = false);

    try {
        const q = query(collection(db, "attendance"), where("fecha", "==", selectedDate));
        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
            querySnapshot.forEach((doc) => {
                const data = doc.data();
                const radio = document.querySelector(`input[name="${data.studentId}"][value="${data.estado}"]`);
                if (radio) radio.checked = true;
            });
            Toast.fire({ icon: 'info', title: `Registros del ${selectedDate} cargados` });
        }
        updateCounter();
    } catch (e) { console.error("Error recuperando datos:", e); }
}

// --- 8. FUNCIONES DE ACCIÓN ---

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
            const docId = `${studentId}_${date}`;
            const ref = doc(db, "attendance", docId);
            batch.set(ref, {
                studentId, nombre, estado: status, fecha: date, lastUpdated: new Date()
            });
            count++;
        }
    });

    if (count === 0) return Toast.fire({ icon: 'warning', title: 'Nada para guardar' });

    try {
        await batch.commit();
        Toast.fire({ icon: 'success', title: 'Asistencia sincronizada' });
        updateCounter();
    } catch (e) { Toast.fire({ icon: 'error', title: 'Error al guardar' }); }
}

async function confirmDelete(id, name) {
    const r = await Swal.fire({ 
        title: `¿Borrar a ${name}?`, 
        text: "Se eliminarán sus registros históricos.",
        icon: 'warning', 
        showCancelButton: true, 
        confirmButtonColor: '#ef4444',
        confirmButtonText: 'Sí, eliminar'
    });
    if (r.isConfirmed) { 
        await deleteDoc(doc(db, "students", id)); 
        Toast.fire({ icon: 'success', title: 'Estudiante eliminado' });
        loadStudents(); 
    }
}

function updateCounter() {
    if (!counterEl || !studentsBody) return;
    const marked = studentsBody.querySelectorAll("input:checked").length;
    const total = studentsBody.querySelectorAll("tr").length;
    counterEl.innerText = `Marcados: ${marked}/${total}`;
    counterEl.className = marked === total ? "text-green-600 font-bold text-xs" : "text-amber-600 text-xs";
}

// --- 9. EVENT LISTENERS ---

dateInput.onchange = checkExistingAttendance;
document.getElementById("saveAttendanceBtn").onclick = saveAttendance;
document.getElementById("logoutBtn").onclick = () => signOut(auth);

document.getElementById("darkModeToggle").onclick = () => {
    const isDark = htmlElement.classList.toggle("dark");
    localStorage.setItem("theme", isDark ? "dark" : "light");
    if (darkIcon) darkIcon.innerText = isDark ? "☀️" : "🌙";
};

if (loginBtn) {
    loginBtn.onclick = async () => {
        const email = document.getElementById("email").value.trim();
        const pass = document.getElementById("password").value.trim();
        if (!email || !pass) return Toast.fire({ icon: 'warning', title: 'Faltan datos' });
        try {
            loginBtn.disabled = true; loginBtn.innerText = "Entrando...";
            await signInWithEmailAndPassword(auth, email, pass);
        } catch (error) {
            Swal.fire("Error", "Acceso denegado", "error");
            loginBtn.disabled = false; loginBtn.innerText = "Entrar";
        }
    };
}

document.getElementById("addStudentBtn").onclick = async () => {
    const name = document.getElementById("newStudentName").value.trim();
    if (!name) return;
    const check = await getDocs(query(collection(db, "students"), where("name", "==", name)));
    if (!check.empty) return Toast.fire({ icon: 'warning', title: 'El alumno ya existe' });

    await addDoc(collection(db, "students"), { name });
    document.getElementById("newStudentName").value = "";
    Toast.fire({ icon: 'success', title: 'Añadido con éxito' });
    loadStudents();
};

document.getElementById("exportExcelBtn").onclick = async () => {
    Swal.fire({ title: 'Generando Excel...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    try {
        const sSnap = await getDocs(collection(db, "students"));
        const aSnap = await getDocs(collection(db, "attendance"));
        const students = sSnap.docs.map(d => ({id: d.id, name: d.data().name}));
        const attendance = aSnap.docs.map(d => d.data());

        const summary = students.map(s => {
            const r = attendance.filter(a => a.studentId === s.id);
            return { 
                "Estudiante": s.name, 
                "Asistencias": r.filter(x => x.estado === "present").length, 
                "Faltas": r.filter(x => x.estado === "absent").length,
                "Justificados": r.filter(x => x.estado === "permission").length,
                "Total": r.length 
            };
        });

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summary), "Reporte General");
        XLSX.writeFile(wb, `Asistencia_${dateInput.value}.xlsx`);
        Swal.close();
        Toast.fire({ icon: 'success', title: 'Reporte listo' });
    } catch (e) { Swal.fire("Error", "Falla al exportar", "error"); }
};

document.getElementById("markAllPresent").onclick = () => {
    document.querySelectorAll('input[value="present"]').forEach(i => i.checked = true);
    updateCounter();
};

searchInput.oninput = (e) => {
    const val = e.target.value.toLowerCase();
    studentsBody.querySelectorAll("tr").forEach(tr => {
        tr.style.display = tr.cells[0].innerText.toLowerCase().includes(val) ? "" : "none";
    });
};

studentsBody.addEventListener('change', (e) => {
    if (e.target.type === "radio") updateCounter();
});