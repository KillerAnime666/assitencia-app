import { db } from "./firebase.js";

import {
  collection,
  getDocs,
  addDoc,
  deleteDoc,
  doc,
  query,
  orderBy
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

import { writeBatch } from 
"https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

document.addEventListener("DOMContentLoaded", () => {

  const studentsBody = document.getElementById("studentsBody");
  const addBtn = document.getElementById("addStudentBtn");
  const loadBtn = document.getElementById("loadStudentsBtn");
  const saveBtn = document.getElementById("saveAttendanceBtn");
  const newStudentInput = document.getElementById("newStudentName");
  const csvFileInput = document.getElementById("csvFile");
  const uploadCsvBtn = document.getElementById("uploadCsvBtn");
  const deleteAllBtn = document.getElementById("deleteAllStudentsBtn");

  // 🔹 Cargar estudiantes
  async function loadStudents() {

    studentsBody.innerHTML = "Cargando...";

    const snapshot = await getDocs(
      query(collection(db, "students"), orderBy("name", "asc"))
    );

    studentsBody.innerHTML = "";

    snapshot.forEach((documento) => {

      const student = documento.data();

      const tr = document.createElement("tr");
      tr.setAttribute("data-id", documento.id);

      tr.innerHTML = `
        <td>${student.name}</td>
        <td><input type="radio" name="${documento.id}" value="present"></td>
        <td><input type="radio" name="${documento.id}" value="absent"></td>
        <td><input type="radio" name="${documento.id}" value="permission"></td>
        <td><button class="delete-btn">Eliminar</button></td>
      `;

      tr.querySelector(".delete-btn").addEventListener("click", async () => {
        await deleteDoc(doc(db, "students", documento.id));
        loadStudents();
      });

      studentsBody.appendChild(tr);
    });
  }

  // 🔹 Agregar estudiante manual
  async function addStudent() {

    const name = newStudentInput.value.trim();
    if (!name) return alert("Ingresa un nombre");

    await addDoc(collection(db, "students"), { name });

    newStudentInput.value = "";
    loadStudents();
  }

  // 🔹 Guardar asistencia
  async function saveAttendance() {

    const rows = document.querySelectorAll("#studentsBody tr");
    const today = new Date().toISOString().split("T")[0];

    if (rows.length === 0) {
      alert("No hay estudiantes cargados");
      return;
    }

    const batch = writeBatch(db);

    for (const row of rows) {

      const studentId = row.dataset.id;
      const nombre = row.cells[0].innerText;
      const selected = row.querySelector("input[type='radio']:checked");

      if (!selected) {
        alert("Falta marcar asistencia para " + nombre);
        return;
      }

      const newDocRef = doc(collection(db, "attendance"));

      batch.set(newDocRef, {
        studentId,
        nombre,
        estado: selected.value,
        fecha: today
      });
    }

    await batch.commit();

    alert("Asistencia guardada correctamente ✅");
  }

  // 🔹 Subir CSV (solo nombres a students)
  async function uploadCSV() {

    const file = csvFileInput.files[0];
    if (!file) return alert("Selecciona un archivo CSV");

    const reader = new FileReader();

    reader.onload = async (event) => {

      const text = event.target.result;
      const rows = text.split("\n").map(row => row.trim());

      if (rows[0].toLowerCase() !== "nombre") {
        alert("El CSV debe tener una sola columna llamada 'nombre'");
        return;
      }

      const batch = writeBatch(db);

      for (let i = 1; i < rows.length; i++) {

        const studentName = rows[i];
        if (!studentName) continue;

        const newDocRef = doc(collection(db, "students"));

        batch.set(newDocRef, { name: studentName });
      }

      await batch.commit();

      alert("Estudiantes cargados correctamente ✅");
      loadStudents();
    };

    reader.readAsText(file, "UTF-8");
  }

  // 🔥 Eliminar TODO (students + attendance)
  async function deleteAllData() {

    const confirmDelete = confirm(
      "⚠ Esto eliminará TODOS los estudiantes y TODA la asistencia.\n\n¿Continuar?"
    );

    if (!confirmDelete) return;

    const batch = writeBatch(db);

    const studentsSnapshot = await getDocs(collection(db, "students"));
    studentsSnapshot.forEach(docu => {
      batch.delete(doc(db, "students", docu.id));
    });

    const attendanceSnapshot = await getDocs(collection(db, "attendance"));
    attendanceSnapshot.forEach(docu => {
      batch.delete(doc(db, "attendance", docu.id));
    });

    await batch.commit();

    studentsBody.innerHTML = "";
    alert("🔥 Sistema reiniciado correctamente");
  }

  // 🔹 Eventos
  addBtn.addEventListener("click", addStudent);
  loadBtn.addEventListener("click", loadStudents);
  saveBtn.addEventListener("click", saveAttendance);
  uploadCsvBtn.addEventListener("click", uploadCSV);
  deleteAllBtn.addEventListener("click", deleteAllData);

});