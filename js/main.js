import { db, auth } from "./firebase.js";
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import { collection, getDocs, addDoc, deleteDoc, doc, query, orderBy, writeBatch } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

const studentsBody = document.getElementById("studentsBody");
const searchInput = document.getElementById("searchStudent");
const dateInput = document.getElementById("attendanceDate");

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