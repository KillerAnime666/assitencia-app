import { auth, db } from "./firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import { collection, getDocs, query, orderBy } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

let attendanceChart = null;
let allData = [];

async function setupDashboard() {
    const studentFilter = document.getElementById("studentFilter");
    try {
        const studentsSnap = await getDocs(query(collection(db, "students"), orderBy("name", "asc")));
        studentFilter.innerHTML = '<option value="all">📈 Vista Global (Todo el curso)</option>';
        studentsSnap.forEach(doc => {
            const opt = document.createElement("option");
            opt.value = doc.data().name;
            opt.textContent = doc.data().name;
            studentFilter.appendChild(opt);
        });

        const attendanceSnap = await getDocs(collection(db, "attendance"));
        allData = attendanceSnap.docs.map(d => d.data());
        updateDashboardView("all");
        studentFilter.onchange = (e) => updateDashboardView(e.target.value);
    } catch (e) { console.error(e); }
}

function updateDashboardView(filter) {
    const filtered = filter === "all" ? allData : allData.filter(d => d.nombre === filter);
    const total = filtered.length;
    const stats = {
        present: filtered.filter(d => d.estado === "present").length,
        absent: filtered.filter(d => d.estado === "absent").length,
        permission: filtered.filter(d => d.estado === "permission").length
    };

    const getPercent = (v) => total > 0 ? ((v / total) * 100).toFixed(1) : 0;

    document.getElementById("countPresent").innerText = stats.present;
    document.getElementById("percentPresent").innerText = getPercent(stats.present) + "%";
    document.getElementById("countAbsent").innerText = stats.absent;
    document.getElementById("percentAbsent").innerText = getPercent(stats.absent) + "%";
    document.getElementById("countPermission").innerText = stats.permission;
    document.getElementById("percentPermission").innerText = getPercent(stats.permission) + "%";

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
            cutout: '70%',
            plugins: {
                legend: { 
                    position: 'bottom',
                    labels: { color: isDark ? '#cbd5e1' : '#475569' }
                }
            }
        }
    });
}

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

if (localStorage.getItem("theme") === "dark") {
    document.documentElement.classList.add("dark");
}