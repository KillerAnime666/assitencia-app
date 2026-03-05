import { auth, db } from "./firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import { collection, getDocs, query, orderBy } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

let attendanceChart = null;
let allData = [];
let studentsList = [];

// --- 1. RENDERIZAR SKELETONS EN LOS NÚMEROS ---
function renderDashboardSkeletons() {
    const ids = ["countPresent", "percentPresent", "countAbsent", "percentAbsent", "countPermission", "percentPermission"];
    ids.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = `<div class="h-6 w-12 bg-slate-200 dark:bg-slate-700 rounded animate-pulse inline-block"></div>`;
    });

    const riskList = document.getElementById("riskList");
    if (riskList) {
        riskList.innerHTML = `<div class="col-span-full h-20 bg-slate-100 dark:bg-slate-800/50 rounded-2xl animate-pulse"></div>`;
    }
}

// --- 2. CONFIGURACIÓN INICIAL ---
async function setupDashboard() {
    const studentFilter = document.getElementById("studentFilter");
    renderDashboardSkeletons();

    try {
        const studentsSnap = await getDocs(query(collection(db, "students"), orderBy("name", "asc")));
        studentsList = studentsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        studentFilter.innerHTML = '<option value="all">📈 Vista Global (Todo el curso)</option>';
        studentsList.forEach(s => {
            const opt = document.createElement("option");
            opt.value = s.id;
            opt.textContent = s.name;
            studentFilter.appendChild(opt);
        });

        const attendanceSnap = await getDocs(collection(db, "attendance"));
        allData = attendanceSnap.docs.map(d => d.data());

        updateDashboardView("all");
        studentFilter.onchange = (e) => updateDashboardView(e.target.value);
    } catch (e) { console.error("Error:", e); }
}

// --- 3. ACTUALIZAR VISTA (MANTIENE TU DISEÑO ORIGINAL) ---
function updateDashboardView(filterId) {
    const filtered = filterId === "all" ? allData : allData.filter(d => d.studentId === filterId);
    const total = filtered.length;

    const stats = {
        present: filtered.filter(d => d.estado === "present").length,
        absent: filtered.filter(d => d.estado === "absent").length,
        permission: filtered.filter(d => d.estado === "permission").length
    };

    const getPercent = (v) => total > 0 ? ((v / total) * 100).toFixed(1) : 0;

    // Actualizamos los IDs sin tocar el HTML de las tarjetas
    document.getElementById("countPresent").innerText = stats.present;
    document.getElementById("percentPresent").innerText = getPercent(stats.present) + "%";
    document.getElementById("countAbsent").innerText = stats.absent;
    document.getElementById("percentAbsent").innerText = getPercent(stats.absent) + "%";
    document.getElementById("countPermission").innerText = stats.permission;
    document.getElementById("percentPermission").innerText = getPercent(stats.permission) + "%";

    renderChart(stats);
    calculateRiskAnalysis();
}

// --- 4. RIESGO CRÍTICO (≥ 6 FALTAS) ---
function calculateRiskAnalysis() {
    const riskListEl = document.getElementById("riskList");
    riskListEl.innerHTML = "";
    let countAtRisk = 0;

    studentsList.forEach(student => {
        const studentRecords = allData.filter(a => a.studentId === student.id);
        const absences = studentRecords.filter(a => a.estado === "absent").length;

        if (absences >= 6) {
            countAtRisk++;
            const totalDays = studentRecords.length;
            const absenceRate = ((absences / totalDays) * 100).toFixed(1);

            const item = document.createElement("div");
            item.className = "flex items-center justify-between p-4 bg-red-50 dark:bg-red-900/10 rounded-2xl border border-red-100 dark:border-red-900/30 transition-all hover:shadow-md";
            item.innerHTML = `
                <div class="flex flex-col">
                    <span class="font-bold text-slate-700 dark:text-slate-200">${student.name}</span>
                    <span class="text-[10px] text-red-600 font-black uppercase">⚠️ ${absences} Faltas Acumuladas</span>
                </div>
                <div class="text-right">
                    <span class="text-xs font-bold text-slate-400 italic">${absenceRate}%</span>
                </div>`;
            riskListEl.appendChild(item);
        }
    });

    if (countAtRisk === 0) {
        riskListEl.innerHTML = `<div class="col-span-full p-6 text-center text-green-600 font-bold text-sm bg-green-50 dark:bg-green-900/10 rounded-2xl border border-green-100 dark:border-green-900/30">✅ Ningún estudiante supera el límite de 6 faltas.</div>`;
    }
}

// --- 5. CHART.JS (TU CONFIGURACIÓN ORIGINAL) ---
function renderChart(stats) {
    const ctx = document.getElementById("attendanceChart").getContext("2d");
    if (attendanceChart) attendanceChart.destroy();

    const isDark = document.documentElement.classList.contains("dark");

    attendanceChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Presentes', 'Ausentes', 'Permisos'],
            datasets: [{
                data: [stats.present, stats.absent, stats.permission],
                backgroundColor: ['#22c55e', '#ef4444', '#940bf5'],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '70%',
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: isDark ? '#cbd5e1' : '#475569',
                        font: { size: 11, weight: 'bold' },
                        padding: 20
                    }
                }
            }
        }
    });
}

// --- SEGURIDAD ---
onAuthStateChanged(auth, async (user) => {
    const navEntries = performance.getEntriesByType("navigation");
    const navType = navEntries.length > 0 ? navEntries[0].type : "";
    if (!user || navType === "reload") {
        if (navType === "reload") await signOut(auth);
        window.location.href = "index.html";
    } else {
        setupDashboard();
    }
});

if (localStorage.getItem("theme") === "dark") document.documentElement.classList.add("dark");