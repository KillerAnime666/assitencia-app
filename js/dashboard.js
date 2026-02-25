import { db } from "./firebase.js";

import { 
  collection, 
  getDocs,
  query,
  where,
  orderBy
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

const studentFilter = document.getElementById("studentFilter");
let attendanceChart = null;

// 🔹 Cargar estudiantes desde colección students
async function loadStudentsFilter() {

  const snapshot = await getDocs(
    query(collection(db, "students"), orderBy("name", "asc"))
  );

  snapshot.forEach(doc => {
    const student = doc.data();

    const option = document.createElement("option");
    option.value = student.name;
    option.textContent = student.name;

    studentFilter.appendChild(option);
  });
}

// 🔹 Cargar Dashboard
async function loadDashboard(studentName = "all") {

  let attendanceQuery;

  if (studentName === "all") {
    attendanceQuery = collection(db, "attendance");
  } else {
    attendanceQuery = query(
      collection(db, "attendance"),
      where("nombre", "==", studentName)
    );
  }

  const snapshot = await getDocs(attendanceQuery);

  let present = 0;
  let absent = 0;
  let permission = 0;

  snapshot.forEach(doc => {
    const data = doc.data();

    if (data.estado === "present") present++;
    if (data.estado === "absent") absent++;
    if (data.estado === "permission") permission++;
  });

  // 🔥 Destruir gráfico anterior si existe
  if (attendanceChart) {
    attendanceChart.destroy();
  }

  attendanceChart = new Chart(
    document.getElementById("attendanceChart"),
    {
      type: "pie",
      data: {
        labels: ["Presentes", "Ausentes", "Permiso"],
        datasets: [{
          data: [present, absent, permission],
          backgroundColor: ['#4CAF50', '#F44336', '#1c07ff']
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: {
            position: "bottom"
          }
        }
      }
    }
  );
}

// 🔹 Evento filtro
studentFilter.addEventListener("change", (e) => {
  loadDashboard(e.target.value);
});

// 🔹 Inicialización
loadStudentsFilter();
loadDashboard();