// --- GANTI URL INI DENGAN URL DEPLOYMENT WEB APP GAS ANDA ---
const GAS_API_URL = 'https://script.google.com/macros/s/AKfycbzeSET0kRJfiop-JXFkmTKvk0FodL2kooru0kDJAYaWkuTr3zd76A4YEv_Q6mGkbwkX/exec'; 

let dataTableRekapan;
let globalLogs = [];
let rawDataPegawai = [];
let globalHariEfektifBulanan = {};
let chartAll, chartPersonal;

let isRekapanLoaded = false;
let isLogsLoaded = false;

$(document).ready(function() {
  // Set default bulan saat ini pada filter utama
  let currentMonth = (new Date().getMonth() + 1).toString().padStart(2, '0');
  let mainFilter = document.getElementById('filterBulanRekapan');
  if(mainFilter) mainFilter.value = currentMonth;
  
  // Satu filter merubah SEMUA komponen sekaligus
  $('#filterBulanRekapan').on('change', function() {
    applyFilterBulan(); 
  });

  $('#selectGrafikPegawai').select2({
    placeholder: "Ketik nama pegawai...",
    allowClear: true,
    width: '100%',
    theme: 'bootstrap-5'
  });

  $('#selectGrafikPegawai').on('change', function() { updateChartPegawai(); });
  loadDataServer();
});

function setDatabaseStatus(status) {
  const badge = document.getElementById('dbStatusBadge');
  if (status === 'connecting') {
    badge.className = 'badge bg-warning text-dark px-3 py-2 rounded-pill shadow-sm status-badge';
    badge.innerHTML = '<i class="fas fa-circle-notch fa-spin me-2"></i> Sinkronisasi...';
  } else if (status === 'connected') {
    badge.className = 'badge bg-success bg-opacity-10 text-success border border-success border-opacity-25 px-3 py-2 rounded-pill status-badge';
    badge.innerHTML = '<i class="fas fa-wifi me-2"></i> Terhubung';
  } else if (status === 'error') {
    badge.className = 'badge bg-danger text-white px-3 py-2 rounded-pill shadow-sm status-badge';
    badge.innerHTML = '<i class="fas fa-exclamation-triangle me-2"></i> Gagal Terhubung';
  }
}

function updateLastUpdated() {
  const now = new Date();
  document.getElementById('lastUpdate').innerText = `Diperbarui: ${now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`;
}

async function loadDataServer(isSilent = false) {
  isRekapanLoaded = false;
  isLogsLoaded = false;
  setDatabaseStatus('connecting');
  
  if (!isSilent) {
    document.getElementById('tabelBody').innerHTML = `
      <tr>
        <td colspan="10" class="text-center py-5">
          <div class="spinner-border text-primary opacity-50 mb-3" style="width: 2.5rem; height: 2.5rem;"></div>
          <h6 class="text-muted fw-normal">Menarik data terbaru dari server...</h6>
        </td>
      </tr>`;
  }
  
  try {
    const response = await fetch(GAS_API_URL);
    if (!response.ok) throw new Error('Jaringan bermasalah.');
    const result = await response.json();
    
    if (result.status === 'success') {
      rawDataPegawai = result.data.rekapan;
      globalLogs = result.data.logs;
      globalHariEfektifBulanan = result.data.hariEfektifBulanan || {};
      
      if (!isSilent) populateDropdownPegawai(rawDataPegawai);
      
      isRekapanLoaded = true;
      isLogsLoaded = true;
      renderChartBulanKeseluruhan();
      updateChartPegawai();
      checkAndRenderRekapan();
    } else { throw new Error(result.message); }
  } catch (error) {
    console.error("Error: ", error);
    setDatabaseStatus('error');
    if (!isSilent) {
      document.getElementById('tabelBody').innerHTML = `<tr><td colspan="10" class="text-center py-5 text-danger bg-danger bg-opacity-10 rounded"><i class="fas fa-exclamation-circle fs-2 mb-2"></i><br>Koneksi ke Database gagal.</td></tr>`;
    }
  }
}

function checkAndRenderRekapan() {
  if (isRekapanLoaded && isLogsLoaded) {
    applyFilterBulan();
    updateLastUpdated();
    setDatabaseStatus('connected'); 
  }
}

function applyFilterBulan() {
  const selectBulan = document.getElementById('filterBulanRekapan');
  const bulanTerpilih = selectBulan.value;
  const currentYear = new Date().getFullYear();
  const formatBulan = `${currentYear}-${bulanTerpilih}`;

  let filteredData = [];
  const validCuti = ["CUTI TAHUNAN", "CUTI MELAHIRKAN", "CUTI SAKIT", "CUTI BESAR", "CUTI BERSAMA/PENGGANTI", "CUTI ALASAN PENTING", "CUTI BERSAMA"];

  rawDataPegawai.forEach(pegawai => {
    const logsPegawaiIni = globalLogs.filter(log => 
      log.nama === pegawai.nama && (bulanTerpilih === "ALL" || log.bulan === formatBulan)
    );
    
    let jmlHadir = 0, jmlCuti = 0, jmlDL = 0, jmlTK = 0;
    let notes = [];
    
    logsPegawaiIni.forEach(log => {
      const st = log.status ? log.status.toUpperCase() : "";
      if (st === "HADIR") jmlHadir++;
      else if (st === "DL" || st === "DINAS LUAR") jmlDL++;
      else if (st === "TK" || st === "TANPA KETERANGAN") jmlTK++;
      else if (validCuti.includes(st)) jmlCuti++;
      
      if (log.keterangan) notes.push(`&bull; ${log.keterangan}`);
    });

    filteredData.push({
      no: pegawai.no, nama: pegawai.nama, golongan: pegawai.golongan,
      hariEfektif: (globalHariEfektifBulanan[formatBulan] && globalHariEfektifBulanan[formatBulan][pegawai.nama]) ? globalHariEfektifBulanan[formatBulan][pegawai.nama] : 0,
      cuti: jmlCuti, dl: jmlDL, tk: jmlTK,
      jmlTidakHadir: jmlCuti + jmlDL + jmlTK,
      jumlahKehadiran: jmlHadir,
      keterangan: notes.join('<br>')
    });
  });

  populateTabelRekapan(filteredData);
  // PENTING: Panggil renderChartBulanKeseluruhan yang akan mengupdate Card Statistik
  renderChartBulanKeseluruhan();
  updateChartPegawai();
}
function animateValue(id, start, end, duration, suffix = '') {
  const obj = document.getElementById(id);
  if(!obj) return;
  let startTimestamp = null;
  const step = (timestamp) => {
    if (!startTimestamp) startTimestamp = timestamp;
    const progress = Math.min((timestamp - startTimestamp) / duration, 1);
    obj.innerHTML = Math.floor(progress * (end - start) + start) + suffix;
    if (progress < 1) window.requestAnimationFrame(step);
  };
  window.requestAnimationFrame(step);
}

function populateTabelRekapan(data) {
  let currentPage = 0; let currentSearch = '';
  if (dataTableRekapan) {
    currentPage = dataTableRekapan.page(); currentSearch = dataTableRekapan.search(); dataTableRekapan.destroy();
  }
  
  let tbody = '';
  data.forEach(row => {
    tbody += `<tr>
      <td class="text-muted fw-medium">${row.no}</td>
      <td class="text-start fw-bold text-dark">${row.nama}</td>
      <td><span class="badge bg-light text-secondary border border-secondary border-opacity-25 px-2 py-1">${row.golongan}</span></td>
      <td class="fw-bold text-primary">${row.hariEfektif}</td>
      <td class="text-muted">${row.cuti}</td>
      <td class="text-muted">${row.dl}</td>
      <td class="text-muted">${row.tk}</td>
      <td class="fw-bold text-danger bg-danger bg-opacity-10">${row.jmlTidakHadir}</td>
      <td class="fw-bold text-success bg-success bg-opacity-10">${row.jumlahKehadiran}</td>
      <td class="text-start small lh-sm">${row.keterangan}</td>
    </tr>`;
  });
  document.getElementById('tabelBody').innerHTML = tbody;
  
  dataTableRekapan = $('#tabelRekapan').DataTable({ 
     pageLength: 10, 
     language: { url: '//cdn.datatables.net/plug-ins/1.13.4/i18n/id.json' },
     dom: '<"row align-items-center mb-3"<"col-md-6"l><"col-md-6"f>>rt<"row align-items-center mt-3"<"col-md-6"i><"col-md-6"p>>',
  });
  
  if (currentSearch) dataTableRekapan.search(currentSearch);
  dataTableRekapan.page(currentPage).draw('page');
}

function populateDropdownPegawai(data) {
  let options = '<option value="">Pilih/Ketik Pegawai...</option>';
  data.forEach(row => { options += `<option value="${row.nama}">${row.nama}</option>`; });
  $('#selectGrafikPegawai').html(options).trigger('change');
  $('#nama').html(options).trigger('change');
}

const colorMap = {
  "Hadir": "#198754", "Cuti Tahunan": "#0dcaf0", "Cuti Melahirkan": "#d63384",
  "Cuti Sakit": "#fd7e14", "Cuti Besar": "#6f42c1", "CUTI BERSAMA/ PENGGANTI": "#6c757d",
  "Cuti Alasan Penting": "#ffc107", "Cuti Bersama": "#20c997", "Dinas Luar": "#0d6efd", 
  "Tanpa Keterangan": "#dc3545", "Libur": "#adb5bd"
};
const statusKeys = ["Hadir", "Cuti Tahunan", "Cuti Melahirkan", "Cuti Sakit", "Cuti Besar", "Cuti Bersama/Pengganti", "Cuti Alasan Penting", "Cuti Bersama", "Dinas Luar", "Tanpa Keterangan", "Libur"];

function renderChartBulanKeseluruhan() {
const bulanTerpilih = document.getElementById('filterBulanRekapan').value; 
  const currentYear = new Date().getFullYear(); 
  const formatBulan = `${currentYear}-${bulanTerpilih}`; 
  
  let mapData = {};
  // Variabel penampung total untuk Card
  let grandTotalHadir = 0;
  let grandTotalAbsen = 0;

  globalLogs.forEach(log => {
    const isMatch = (bulanTerpilih === "ALL" || log.bulan === formatBulan);
    if(isMatch && log.status.toUpperCase() !== "LIBUR") {
      if(!mapData[log.bulan]) { 
        mapData[log.bulan] = { "Total Kehadiran": 0, "Total Cuti": 0, "DL": 0, "TK": 0 }; 
      }
      
      const st = log.status.toUpperCase();
      const cutiCategories = ["CUTI TAHUNAN", "CUTI MELAHIRKAN", "CUTI SAKIT", "CUTI BESAR", "CUTI BERSAMA/PENGGANTI", "CUTI ALASAN PENTING", "CUTI BERSAMA"];

      if(st === "HADIR") {
        mapData[log.bulan]["Total Kehadiran"]++;
        grandTotalHadir++; // Tambahkan ke counter card
      } else {
        grandTotalAbsen++; // Semua selain Hadir & Libur masuk ke Absen[cite: 9]
        if(st === "DL" || st === "DINAS LUAR") mapData[log.bulan]["DL"]++; 
        else if(st === "TK" || st === "TANPA KETERANGAN") mapData[log.bulan]["TK"]++;
        else if(cutiCategories.includes(st)) mapData[log.bulan]["Total Cuti"]++;
      }
    }
  });

  // UPDATE CARD DI SINI AGAR PASTI SAMA DENGAN CHART[cite: 9]
  animateValue("statTotalHadir", 0, grandTotalHadir, 500);
  animateValue("statTotalAbsen", 0, grandTotalAbsen, 500);
  animateValue("statTotalPegawai", 0, rawDataPegawai.length, 500);

  let labelsOriginal = Object.keys(mapData).sort(); 
  
  const shortMonths = {
    "01": "Jan", "02": "Feb", "03": "Mar", "04": "Apr", "05": "Mei", "06": "Jun", 
    "07": "Jul", "08": "Ags", "09": "Sep", "10": "Okt", "11": "Nov", "12": "Des"
  };

  let labelsNamaBulan = labelsOriginal.map(l => {
    let kodeBulan = l.includes('-') ? l.split('-')[1] : l;
    return shortMonths[kodeBulan] || kodeBulan;
  });

  // 2. Setup Dataset dengan Label Angka
  let datasets = [];
  const customColorMap = {
    "Total Kehadiran": "#198754", 
    "Total Cuti": "#fd7e14",      
    "DL": "#0d6efd",              
    "TK": "#dc3545"               
  };

  Object.keys(customColorMap).forEach(key => {
    let dataArray = labelsOriginal.map(b => mapData[b][key] || 0);
    datasets.push({ 
      label: key, 
      data: dataArray, 
      backgroundColor: customColorMap[key], 
      borderRadius: 4, 
      barPercentage: 0.7,
      borderWidth: 0,
      // Konfigurasi datalabels spesifik per dataset
      datalabels: {
        anchor: 'end',
        align: 'top',
        offset: 2,
        color: customColorMap[key],
        font: { weight: 'bold', size: 11 }
      }
    });
  });

  const canvas = document.getElementById('chartAllBulan');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  
  if(window.chartAll) window.chartAll.destroy(); 
  
  // Pastikan plugin terdaftar
  if(typeof ChartDataLabels !== 'undefined') {
    Chart.register(ChartDataLabels);
  }

  window.chartAll = new Chart(ctx, {
    type: 'bar',
    data: { 
      labels: labelsNamaBulan.length ? labelsNamaBulan : ['No Data'], 
      datasets: datasets 
    },
    options: {
      responsive: true, 
      maintainAspectRatio: false, 
      layout: { padding: { top: 35 } }, // Ruang ekstra untuk label angka di atas
      plugins: { 
        legend: { 
          position: 'top', 
          align: 'end',
          labels: { usePointStyle: true, boxWidth: 8, font: { family: "'Plus Jakarta Sans'", size: 11 } } 
        },
        // Pengaturan global datalabels
        datalabels: {
          display: true,
          formatter: (value) => value > 0 ? value : '' // Sembunyikan jika angka 0
        }
      },
      scales: { 
        x: { grid: { display: false } }, 
        y: { 
          beginAtZero: true, 
          grid: { borderDash: [5, 5] }, 
          ticks: { display: false } // Sembunyikan angka di sumbu Y agar bersih
        } 
      }
    }
  });
}

function updateChartPegawai() {
  let namaPegawai = document.getElementById('selectGrafikPegawai').value;
  if(!namaPegawai) return;

  let bulanTerpilih = document.getElementById('selectBulanGrafik').value;
  let currentYear = new Date().getFullYear(); 
  let formatBulan = `${currentYear}-${bulanTerpilih}`;

  // Daftar rekapan status sesuai permintaan
  let stats = { 
    "Hadir": 0, "Libur": 0, "Cuti Tahunan": 0, "Cuti Melahirkan": 0, "Cuti Sakit": 0, 
    "Cuti Besar": 0, "Cuti Bersama/Pengganti": 0, "Cuti Alasan Penting": 0, 
    "Cuti Bersama": 0, "Dinas Luar": 0, "Tanpa Keterangan": 0 
  };

  globalLogs.forEach(log => {
    if(log.nama === namaPegawai && (bulanTerpilih === "ALL" || log.bulan === formatBulan)) {
      let st = log.status.toUpperCase();
      
      if(st === "HADIR") stats["Hadir"]++;
      else if(st === "LIBUR") stats["Libur"]++;
      else if(st === "CUTI TAHUNAN") stats["Cuti Tahunan"]++;
      else if(st === "CUTI MELAHIRKAN") stats["Cuti Melahirkan"]++;
      else if(st === "CUTI SAKIT") stats["Cuti Sakit"]++;
      else if(st === "CUTI BESAR") stats["Cuti Besar"]++;
      else if(st === "CUTI BERSAMA/PENGGANTI") stats["Cuti Bersama/Pengganti"]++;
      else if(st === "CUTI ALASAN PENTING") stats["Cuti Alasan Penting"]++;
      else if(st === "DINAS LUAR" || st === "DL") stats["Dinas Luar"]++;
      else if(st === "TANPA KETERANGAN" || st === "TK") stats["Tanpa Keterangan"]++;
      else if(st === "CUTI BERSAMA") stats["Cuti Bersama"]++;
    }
  });

  let labels = [], dataCounts = [], bgColors = [], totalTercatat = 0;
  
  for (let key in stats) {
    if (stats[key] > 0) { 
      labels.push(key); 
      dataCounts.push(stats[key]); 
      bgColors.push(colorMap[key] || "#cccccc"); 
      totalTercatat += stats[key]; 
    }
  }

  // Pembagi persentase murni dari total log yang terekam (termasuk Libur dll)
  let pembagi = totalTercatat;

  const ctx = document.getElementById('chartPerPegawai').getContext('2d');
  if(chartPersonal) chartPersonal.destroy();

  chartPersonal = new Chart(ctx, {
    type: 'pie',
    data: {
      labels: labels.length ? labels : ['Belum Ada Data'],
      datasets: [{ data: dataCounts.length ? dataCounts : [1], backgroundColor: bgColors.length ? bgColors : ['#f8f9fa'], borderWidth: 1, hoverOffset: 15 }]
    },
    options: {
      responsive: true, maintainAspectRatio: false, 
      animation: { animateRotate: true, animateScale: true, duration: 1500, easing: 'easeOutBounce' },
      plugins: {
        legend: { position: 'right', labels: { usePointStyle: true, padding: 15, font: { family: "'Plus Jakarta Sans', sans-serif", size: 11 } } },
        datalabels: { 
          color: (context) => {
             let label = context.chart.data.labels[context.dataIndex];
             // Jika Libur atau Belum ada data, warna teks gelap agar terbaca di background terang
             return label === 'Belum Ada Data' || label === 'Libur' ? '#475569' : '#ffffff';
          },
          font: { weight: 'bold', size: 12 },
          formatter: (value, context) => {
            let label = context.chart.data.labels[context.dataIndex];
            if (label === 'Belum Ada Data' || pembagi === 0) return '';
            let percentage = ((value / pembagi) * 100).toFixed(1);
            return percentage > 0 ? percentage + '%' : ''; 
          }
        },
        tooltip: { 
          backgroundColor: 'rgba(255, 255, 255, 0.9)', titleColor: '#2c3e50', bodyColor: '#2c3e50', borderColor: '#e9ecef', borderWidth: 1, 
          callbacks: { 
            label: (c) => {
              if (pembagi === 0) return ' Belum Ada Data';
              let percentage = ((c.raw / pembagi) * 100).toFixed(1);
              return ` ${c.label}: ${c.raw} Hari (${percentage}%)`;
            }
          } 
        }
      }
    }
  });
}
