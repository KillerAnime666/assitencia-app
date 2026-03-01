import { db } from "./firebase.js";
import { collection, getDocs, query, orderBy } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

import { auth } from "./firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";

onAuthStateChanged(auth, async (user) => {
    // Si no hay usuario O si la página se acaba de recargar (F5)
    const isReload = performance.navigation.type === 1; 

    if (!user || isReload) {
        if (isReload) await signOut(auth); // Limpiar sesión si fue F5
        window.location.href = "index.html"; // Mandar al login
    } else {
        // Solo si hay usuario y NO es una recarga, inicializamos el dashboard
        loadDashboardData(); 
    }
});

const studentFilter = document.getElementById("studentFilter");
let attendanceChart = null;
let allData = []; // Caché local para no re-consultar Firebase innecesariamente


onAuthStateChanged(auth, (user) => {
    if (!user) {
        // 🚨 SI NO HAY USUARIO (por recarga o acceso directo), VOLVER AL INDEX
        window.location.href = "index.html";
    } else {
        // Si hay usuario, cargar los gráficos
        renderCharts(); 
    }
});


// --- CARGAR FILTRO ---
async function setupDashboard() {
    // 1. Cargar lista de estudiantes para el select
    const studentsSnap = await getDocs(query(collection(db, "students"), orderBy("name", "asc")));
    studentsSnap.forEach(doc => {
        const opt = document.createElement("option");
        opt.value = doc.data().name;
        opt.textContent = doc.data().name;
        studentFilter.appendChild(opt);
    });

    // 2. Cargar toda la asistencia una sola vez
    const attendanceSnap = await getDocs(collection(db, "attendance"));
    allData = attendanceSnap.docs.map(d => d.data());

    // 3. Render inicial (Global)
    updateDashboard("all");
}

// --- ACTUALIZAR DATOS ---
function updateDashboard(filter) {
    // Filtrar datos
    const filtered = filter === "all" 
        ? allData 
        : allData.filter(d => d.nombre === filter);

    const total = filtered.length;
    const stats = {
        present: filtered.filter(d => d.estado === "present").length,
        absent: filtered.filter(d => d.estado === "absent").length,
        permission: filtered.filter(d => d.estado === "permission").length
    };

    // Calcular porcentajes
    const getPercent = (val) => total > 0 ? ((val / total) * 100).toFixed(1) : 0;

    // Actualizar UI (Textos)
    document.getElementById("statsTitle").innerText = filter === "all" ? "Estadísticas del Curso" : `Reporte de ${filter}`;
    document.getElementById("totalRecords").innerText = total;
    
    document.getElementById("countPresent").innerText = stats.present;
    document.getElementById("percentPresent").innerText = `${getPercent(stats.present)}%`;
    
    document.getElementById("countAbsent").innerText = stats.absent;
    document.getElementById("percentAbsent").innerText = `${getPercent(stats.absent)}%`;
    
    document.getElementById("countPermission").innerText = stats.permission;
    document.getElementById("percentPermission").innerText = `${getPercent(stats.permission)}%`;

    // Actualizar Gráfico
    renderPieChart(stats, total);
}

// --- RENDERIZAR CHART ---
function renderPieChart(stats, total) {
    const ctx = document.getElementById("attendanceChart").getContext("2d");

    if (attendanceChart) attendanceChart.destroy();

    attendanceChart = new Chart(ctx, {
        type: 'doughnut', // Estilo dona, es más moderno que el pie completo
        data: {
            labels: ['Presentes', 'Ausentes', 'Permisos'],
            datasets: [{
                data: [stats.present, stats.absent, stats.permission],
                backgroundColor: ['#22c55e', '#ef4444', '#940bf5'],
                hoverOffset: 20,
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        padding: 20,
                        font: { size: 14, weight: 'bold' }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const value = context.raw;
                            const percent = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
                            return ` Cantidad: ${value} (${percent}%)`;
                        }
                    }
                }
            },
            cutout: '70%' // Hace que sea una dona elegante
        }
    });
}

// Eventos
studentFilter.addEventListener("change", (e) => updateDashboard(e.target.value));

// Inicialización
setupDashboard();