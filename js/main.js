import { db, auth } from "./firebase.js";
import { 
  signInWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import {
  collection, getDocs, addDoc, deleteDoc, doc, query, orderBy, writeBatch, setDoc
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

// --- REFERENCIAS DOM ---
const loginSection = document.getElementById("loginSection");
const mainContent = document.getElementById("mainContent");
const studentsBody = document.getElementById("studentsBody");

// --- GESTIÓN DE SESIÓN ---
onAuthStateChanged(auth, (user) => {
  if (user) {
    loginSection.style.display = "none";
    mainContent.style.display = "block";
    loadStudents();
  } else {
    loginSection.style.display = "block";
    mainContent.style.display = "none";
  }
});

document.getElementById("loginBtn").addEventListener("click", async () => {
  const email = document.getElementById("email").value;
  const pass = document.getElementById("password").value;
  try {
    await signInWithEmailAndPassword(auth, email, pass);
  } catch (e) { alert("Acceso denegado: " + e.message); }
});

document.getElementById("logoutBtn").addEventListener("click", () => signOut(auth));

// --- LÓGICA DE ASISTENCIA ---
async function loadStudents() {
  studentsBody.innerHTML = "<tr><td colspan='5'>Cargando base de datos...</td></tr>";
  const snapshot = await getDocs(query(collection(db, "students"), orderBy("name", "asc")));
  studentsBody.innerHTML = "";

  snapshot.forEach((documento) => {
    const student = documento.data();
    const tr = document.createElement("tr");
    tr.setAttribute("data-id", documento.id);
    tr.innerHTML = `
      <td style="text-align: left; padding-left: 20px;"><strong>${student.name}</strong></td>
      <td><input type="radio" name="${documento.id}" value="present"></td>
      <td><input type="radio" name="${documento.id}" value="absent"></td>
      <td><input type="radio" name="${documento.id}" value="permission"></td>
      <td><button class="delete-btn" style="background:none; color:red; border:none; cursor:pointer;">✖</button></td>
    `;

    tr.querySelector(".delete-btn").addEventListener("click", async () => {
      if(confirm(`¿Eliminar a ${student.name}?`)) {
        await deleteDoc(doc(db, "students", documento.id));
        loadStudents();
      }
    });
    studentsBody.appendChild(tr);
  });
}

async function saveAttendance() {
  const rows = document.querySelectorAll("#studentsBody tr");
  const now = new Date();
  // Formato YYYY-MM-DD para el ID
  const today = `${now.getFullYear()}-${(now.getMonth()+1).toString().padStart(2,'0')}-${now.getDate().toString().padStart(2,'0')}`;
  
  if (rows.length === 0) return alert("No hay alumnos en la lista.");

  const batch = writeBatch(db);
  let markedCount = 0;

  for (const row of rows) {
    const studentId = row.dataset.id;
    const nombre = row.cells[0].innerText;
    const selected = row.querySelector("input[type='radio']:checked");

    if (selected) {
      // ID ÚNICO: Previene duplicados si se pulsa el botón dos veces el mismo día
      const attendanceId = `${studentId}_${today}`;
      const attendanceRef = doc(db, "attendance", attendanceId);

      batch.set(attendanceRef, {
        studentId,
        nombre,
        estado: selected.value,
        fecha: today,
        timestamp: new Date()
      });
      markedCount++;
    }
  }

  if (markedCount < rows.length) {
    if (!confirm("No has marcado a todos los alumnos. ¿Guardar de todas formas?")) return;
  }

  try {
    await batch.commit();
    alert(`Asistencia guardada: ${today}. Se registraron ${markedCount} alumnos.`);
  } catch (e) { alert("Error de permisos en Firebase"); }
}

// --- UTILIDADES ---
async function addStudent() {
  const nameInput = document.getElementById("newStudentName");
  const name = nameInput.value.trim();
  if (!name) return;
  await addDoc(collection(db, "students"), { name });
  nameInput.value = "";
  loadStudents();
}

async function uploadCSV() {
  const file = document.getElementById("csvFile").files[0];
  if (!file) return alert("Selecciona un archivo");
  const reader = new FileReader();
  reader.onload = async (e) => {
    const lines = e.target.result.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
    if (lines[0].toLowerCase() !== "nombre") return alert("El CSV debe iniciar con la cabecera 'nombre'");

    const batch = writeBatch(db);
    for (let i = 1; i < lines.length; i++) {
      batch.set(doc(collection(db, "students")), { name: lines[i] });
    }
    await batch.commit();
    alert("Lista importada correctamente");
    loadStudents();
  };
  reader.readAsText(file);
}

// --- EVENTOS ---
document.getElementById("addStudentBtn").addEventListener("click", addStudent);
document.getElementById("saveAttendanceBtn").addEventListener("click", saveAttendance);
document.getElementById("uploadCsvBtn").addEventListener("click", uploadCSV);