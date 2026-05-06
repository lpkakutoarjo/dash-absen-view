// --- GANTI URL INI DENGAN URL DEPLOYMENT WEB APP GAS ANDA ---
const GAS_API_URL = 'https://script.google.com/macros/s/AKfycbw-eXwNmHVpqsC2g7onAi8BAUhGZhN37H4pUJDZifomnJ_V_aTLZCOyp4_vzJXmbWsM/exec'; 

let dataTableRekapan;
let globalLogs = [];
let rawDataPegawai = [];
let globalHariEfektifBulanan = {};
let chartAll, chartPersonal;

let isRekapanLoaded = false;
let isLogsLoaded = false;

$(document).ready(function() {
  let currentMonth = (new Date().getMonth() + 1).toString().padStart(2, '0');
  document.getElementById('filterBulanRekapan').value = currentMonth;
  document.getElementById('selectBulanGlobal').value = currentMonth;
  document.getElementById('selectBulanGrafik').value = currentMonth;
  
  $('#selectGrafikPegawai').select2({
    placeholder: "Ketik nama pegawai untuk mencari...",
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
  let selectBulan = document.getElementById('filterBulanRekapan');
  let bulanTerpilih = selectBulan.value;
  let teksBulanTerpilih = selectBulan.options[selectBulan.selectedIndex].text;
  
  let labelBulanStat = document.getElementById('labelBulanStat');
  if(labelBulanStat) {
    labelBulanStat.innerHTML = `<i class="fas fa-calendar-alt me-1"></i> ${bulanTerpilih === "ALL" ? "Sepanjang Tahun" : teksBulanTerpilih}`;
  }

  let currentYear = new Date().getFullYear();
  let filteredData = [];
  let totalKeseluruhanHadir = 0;
  let totalKeseluruhanAbsen = 0;

  // Daftar status cuti spesifik yang dihitung sebagai Ketidakhadiran (Cuti Bersama dikecualikan)
  const validCuti = [
    "CUTI TAHUNAN", 
    "CUTI MELAHIRKAN", 
    "CUTI SAKIT", 
    "CUTI BESAR", 
    "CUTI DILUAR TANGGUNGAN NEGARA", 
    "CUTI ALASAN PENTING"
  ];

  rawDataPegawai.forEach(pegawai => {
    let formatBulan = `${currentYear}-${bulanTerpilih}`;
    let logsBulanIni = globalLogs.filter(log => log.nama === pegawai.nama && (bulanTerpilih === "ALL" || log.bulan === formatBulan));
    
    let jmlHadir = 0, jmlCuti = 0, jmlDL = 0, jmlTK = 0;
    let notesBulanIni = []; 
    
    logsBulanIni.forEach(log => {
      let st = log.status.toUpperCase();
      
      // Filter status kehadiran dan ketidakhadiran sesuai aturan
      if (st === "HADIR") {
        jmlHadir++;
      } else if (st === "DINAS LUAR" || st === "DL") {
        jmlDL++;
      } else if (st === "TANPA KETERANGAN" || st === "TK") {
        jmlTK++;
      } else if (validCuti.includes(st)) {
        jmlCuti++; 
      }
      
      // Keterangan jurnal direkam dan DITAMBAHKAN POIN (&bull;)
      if (log.keterangan && log.keterangan.trim() !== "") {
        let hariTgl = log.tanggal.split('-')[2]; 
        // Penambahan &bull; di awal string
        notesBulanIni.push(`&bull; Tgl ${hariTgl}: <span class="text-dark">${log.keterangan}</span>`);
      }
    });
    
    let jmlTidakHadir = jmlCuti + jmlDL + jmlTK;
    let hariEfektif = 0;
    
    if (bulanTerpilih === "ALL") {
      hariEfektif = parseInt(pegawai.hariEfektif || pegawai["HARI EFEKTIF"] || pegawai.HariEfektif) || 0;
    } else {
      hariEfektif = (globalHariEfektifBulanan[formatBulan] && globalHariEfektifBulanan[formatBulan][pegawai.nama]) ? globalHariEfektifBulanan[formatBulan][pegawai.nama] : 0;
    }
    
    let finalKeterangan = notesBulanIni.length > 0 ? notesBulanIni.join('<br>') : '<span class="text-muted fst-italic">-</span>';
    totalKeseluruhanHadir += jmlHadir;
    totalKeseluruhanAbsen += jmlTidakHadir;

    filteredData.push({
      no: pegawai.no, nama: pegawai.nama, golongan: pegawai.golongan,
      hariEfektif: hariEfektif, cuti: jmlCuti, dl: jmlDL, tk: jmlTK,
      jmlTidakHadir: jmlTidakHadir, jumlahKehadiran: jmlHadir, keterangan: finalKeterangan
    });
  });

  animateValue("statTotalPegawai", 0, filteredData.length, 500);
  document.getElementById("statTotalHadir").innerHTML = `${totalKeseluruhanHadir} <span class="fs-6 text-muted fw-normal">Hari</span>`;
  document.getElementById("statTotalAbsen").innerHTML = `${totalKeseluruhanAbsen} <span class="fs-6 text-muted fw-normal">Hari</span>`;

  populateTabelRekapan(filteredData);
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
  "Cuti Sakit": "#fd7e14", "Cuti Besar": "#6f42c1", "Cuti Diluar Tanggungan Negara": "#6c757d",
  "Cuti Alasan Penting": "#ffc107", "Cuti Bersama": "#20c997", "Dinas Luar": "#0d6efd", 
  "Tanpa Keterangan": "#dc3545", "Libur": "#adb5bd"
};
const statusKeys = ["Hadir", "Cuti Tahunan", "Cuti Melahirkan", "Cuti Sakit", "Cuti Besar", "Cuti Diluar Tanggungan Negara", "Cuti Alasan Penting", "Cuti Bersama", "Dinas Luar", "Tanpa Keterangan", "Libur"];

function renderChartBulanKeseluruhan() {
  let selectBulan = document.getElementById('selectBulanGlobal');
  if (!selectBulan) return;
  let bulanTerpilih = selectBulan.value; 
  let currentYear = new Date().getFullYear(); 
  let formatBulan = `${currentYear}-${bulanTerpilih}`; 
  let mapData = {};

  // 1. Kumpulkan Data Log
  globalLogs.forEach(log => {
    let isMatch = (bulanTerpilih === "ALL" || log.bulan === formatBulan);
    if(isMatch && log.status !== "LIBUR") {
      if(!mapData[log.bulan]) { 
        mapData[log.bulan] = {"Hadir": 0, "Cuti Tahunan": 0, "Cuti Melahirkan": 0, "Cuti Sakit": 0, "Cuti Besar": 0, "Cuti Diluar Tanggungan Negara": 0, "Cuti Alasan Penting": 0, "Dinas Luar": 0, "Tanpa Keterangan": 0}; 
      }
      let st = log.status.toUpperCase();
      if(st === "HADIR") mapData[log.bulan]["Hadir"]++; 
      else if(st === "DL" || st === "DINAS LUAR") mapData[log.bulan]["Dinas Luar"]++; 
      else if(st === "TK" || st === "TANPA KETERANGAN") mapData[log.bulan]["Tanpa Keterangan"]++;
      else {
        let key = Object.keys(colorMap).find(k => k.toUpperCase() === st);
        if(key) mapData[log.bulan][key]++;
      }
    }
  });

  let labelsOriginal = Object.keys(mapData).sort(); 
  
  // 2. Format Nama Bulan (3 Huruf)
  const shortMonths = {
    "01": "Jan", "02": "Feb", "03": "Mar", "04": "Apr", 
    "05": "Mei", "06": "Jun", "07": "Jul", "08": "Ags", 
    "09": "Sep", "10": "Okt", "11": "Nov", "12": "Des"
  };

  let labelsNamaBulan = labelsOriginal.map(l => {
    let kodeBulan = l.includes('-') ? l.split('-')[1] : l;
    return shortMonths[kodeBulan] || kodeBulan;
  });

  // 3. Setup Dataset
  let datasets = [];
  let statusKeys = ["Hadir", "Cuti Tahunan", "Cuti Melahirkan", "Cuti Sakit", "Cuti Besar", "Cuti Diluar Tanggungan Negara", "Cuti Alasan Penting", "Dinas Luar", "Tanpa Keterangan"];

  statusKeys.forEach(key => {
    let dataArray = labelsOriginal.map(b => mapData[b][key] || 0);
    if (dataArray.some(val => val > 0)) {
      datasets.push({ 
        label: key, 
        data: dataArray, 
        backgroundColor: colorMap[key] || "#cccccc", 
        borderRadius: 4, 
        barPercentage: 0.7,  // Jarak renggang ala Cendol Dash
        borderWidth: 0
      });
    }
  });

  // 4. Render Chart
  const canvas = document.getElementById('chartAllBulan');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  
  if(window.chartAll) window.chartAll.destroy(); 
  if(typeof ChartDataLabels !== 'undefined') Chart.register(ChartDataLabels);

  window.chartAll = new Chart(ctx, {
    type: 'bar',
    data: { 
      labels: labelsNamaBulan.length ? labelsNamaBulan : ['No Data'], 
      datasets: datasets.length ? datasets : [{ label: 'Empty', data: [0], backgroundColor: '#e2e8f0' }] 
    },
    options: {
      responsive: true, 
      maintainAspectRatio: false, 
      layout: { padding: { top: 30 } }, // Jarak atas diperlebar agar angka tidak terpotong
      interaction: { mode: 'index', intersect: false },
      plugins: { 
        legend: { 
          position: 'top', 
          align: 'end',     // Legend di Atas Kanan
          labels: { 
            usePointStyle: true, 
            boxWidth: 8, 
            padding: 15, 
            font: { family: "'Plus Jakarta Sans', sans-serif", size: 11, weight: '500' },
            color: '#64748b'
          } 
        }, 
        datalabels: { 
          display: true, 
          // Warna teks mengikuti warna bar (seperti gambar Cendol Dash)
          color: function(context) {
            return context.dataset.backgroundColor;
          },
          font: { weight: 'bold', size: 11, family: "'Plus Jakarta Sans', sans-serif" }, 
          // Posisi angka diubah ke ATAS bar
          anchor: 'end',
          align: 'top',
          offset: 4,
          formatter: (value) => value > 0 ? value : ''
        },
        tooltip: { 
          backgroundColor: '#1e293b', 
          padding: 12,
          titleFont: { family: "'Plus Jakarta Sans'", size: 13 },
          bodyFont: { family: "'Plus Jakarta Sans'", size: 12 },
          titleColor: '#ffffff', 
          bodyColor: '#ffffff', 
          borderColor: 'transparent', 
          borderWidth: 0,
          cornerRadius: 8
        } 
      },
      scales: { 
        x: { 
          stacked: false, // DIBUAT TIDAK BERTUMPUK (Side-by-side)
          grid: { display: false }, 
          ticks: { font: { family: "'Plus Jakarta Sans'", weight: '600' }, color: '#475569' },
          border: { display: false }
        }, 
        y: { 
          stacked: false, // DIBUAT TIDAK BERTUMPUK (Side-by-side)
          beginAtZero: true,
          border: { display: false }, 
          grid: { 
            color: '#e2e8f0', 
            drawBorder: false, 
            borderDash: [5, 5] // Grid putus-putus
          }, 
          ticks: { display: false } // Angka Y dihilangkan
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
    "Cuti Besar": 0, "Cuti Diluar Tanggungan Negara": 0, "Cuti Alasan Penting": 0, 
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
      else if(st === "CUTI DILUAR TANGGUNGAN NEGARA") stats["Cuti Diluar Tanggungan Negara"]++;
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
