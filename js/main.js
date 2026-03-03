import { db, auth } from "./firebase.js";
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import { collection, getDocs, addDoc, deleteDoc, doc, query, orderBy, writeBatch, where } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

// --- 1. CONFIGURACIÓN INMEDIATA DEL TEMA (PARA EVITAR PARPADEO) ---
const htmlElement = document.documentElement;
if (localStorage.getItem("theme") === "dark") {
    htmlElement.classList.add("dark");
}

// --- 2. REFERENCIAS AL DOM ---
// Las envolvemos en una función o las llamamos después para asegurar que existan
const getEls = () => ({
    studentsBody: document.getElementById("studentsBody"),
    searchInput: document.getElementById("searchStudent"),
    dateInput: document.getElementById("attendanceDate"),
    counterEl: document.getElementById("attendanceCounter"),
    loginBtn: document.getElementById("loginBtn"),
    darkIcon: document.getElementById("darkIcon"),
    darkModeToggle: document.getElementById("darkModeToggle")
});

// --- 3. SEGURIDAD AL RECARGAR (MEJORADA) ---
window.addEventListener('load', async () => {
    const { darkIcon } = getEls();
    // Actualizar icono de la luna según el tema cargado
    if (darkIcon) {
        darkIcon.innerText = htmlElement.classList.contains("dark") ? "☀️" : "🌙";
    }

    try {
        const navEntries = performance.getEntriesByType("navigation");
        if (navEntries.length > 0 && navEntries[0].type === "reload") {
            await signOut(auth);
        }
    } catch (e) { console.warn("Navigation API no soportada"); }
});

// --- 4. OBSERVADOR DE SESIÓN ---
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

// --- 5. LÓGICA DE LOGIN ---
document.addEventListener('click', async (e) => {
    if (e.target.id === "loginBtn") {
        const email = document.getElementById("email").value.trim();
        const pass = document.getElementById("password").value.trim();

        if (!email || !pass) return Swal.fire("Atención", "Ingresa tus datos", "warning");

        try {
            e.target.disabled = true;
            e.target.innerText = "Cargando...";
            await signInWithEmailAndPassword(auth, email, pass);
        } catch (error) {
            Swal.fire("Error", "Correo o contraseña incorrectos", "error");
            e.target.disabled = false;
            e.target.innerText = "Entrar al Sistema";
        }
    }

    // --- 6. LÓGICA DE MODO OSCURO (DENTRO DEL EVENTO CLICK) ---
    if (e.target.closest("#darkModeToggle")) {
        const isDark = htmlElement.classList.toggle("dark");
        localStorage.setItem("theme", isDark ? "dark" : "light");
        const { darkIcon } = getEls();
        if (darkIcon) darkIcon.innerText = isDark ? "☀️" : "🌙";
    }
});

// --- 7. FUNCIONES DE LA APP ---

async function loadStudents() {
    const { studentsBody, dateInput } = getEls();
    if (!studentsBody) return;
    
    if (!dateInput.value) dateInput.value = new Date().toISOString().split('T')[0];

    studentsBody.innerHTML = "<tr><td colspan='5' class='p-10 text-center text-gray-400'>Cargando...</td></tr>";
    
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
                <td class="p-4 font-semibold text-sm">${s.name}</td>
                <td class="p-4 text-center"><input type="radio" name="${d.id}" value="present" class="accent-green-500 w-4 h-4 cursor-pointer"></td>
                <td class="p-4 text-center"><input type="radio" name="${d.id}" value="absent" class="accent-red-500 w-4 h-4 cursor-pointer"></td>
                <td class="p-4 text-center"><input type="radio" name="${d.id}" value="permission" class="accent-[#940bf5] w-4 h-4 cursor-pointer"></td>
                <td class="p-4 text-center text-red-500 cursor-pointer delete-btn" onclick="confirmDelete('${d.id}', '${s.name}')">✖</td>
            `;
            studentsBody.appendChild(tr);
        });
        updateCounter();
    } catch (e) { console.error(e); }
}

function updateCounter() {
    const { studentsBody, counterEl } = getEls();
    if (!counterEl || !studentsBody) return;
    const total = studentsBody.querySelectorAll("tr").length;
    const marked = studentsBody.querySelectorAll("input:checked").length;
    counterEl.innerText = `Marcados: ${marked}/${total}`;
    counterEl.className = marked === total ? "text-green-600 font-bold text-xs" : "text-amber-600 text-xs";
}

// Globalizar funciones necesarias para el HTML antiguo
window.confirmDelete = async (id, name) => {
    const r = await Swal.fire({ title: `¿Borrar a ${name}?`, icon: 'warning', showCancelButton: true });
    if (r.isConfirmed) { await deleteDoc(doc(db, "students", id)); loadStudents(); }
};

// --- OTROS EVENTOS ---
document.addEventListener('change', (e) => {
    if (e.target.type === "radio") updateCounter();
});

document.getElementById("logoutBtn").onclick = () => signOut(auth);

document.getElementById("markAllPresent").onclick = () => {
    document.querySelectorAll('input[value="present"]').forEach(i => i.checked = true);
    updateCounter();
};

document.getElementById("saveAttendanceBtn").onclick = async () => {
    const { studentsBody, dateInput } = getEls();
    const rows = studentsBody.querySelectorAll("tr");
    const date = dateInput.value;
    const batch = writeBatch(db);
    let count = 0;

    rows.forEach(row => {
        const status = row.querySelector("input:checked")?.value;
        if (status) {
            batch.set(doc(db, "attendance", `${row.dataset.id}_${date}`), {
                studentId: row.dataset.id, nombre: row.cells[0].innerText, estado: status, fecha: date
            });
            count++;
        }
    });

    if (count === 0) return Swal.fire("Error", "No marcaste a nadie", "error");
    await batch.commit();
    Swal.fire("Éxito", "Asistencia guardada", "success");
};