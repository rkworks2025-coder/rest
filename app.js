(() => {
  const GAS_URL = 'https://script.google.com/macros/s/AKfycby9RpFiUbYu6YX6JW9XfwbDx36_4AIlGEQMOxR3SnxgNdoRUJKfyxvF3b1SEYwuHb3X/exec';
  const AREA_MAP = { '大和市': 'yamato', '海老名市': 'ebina', '調布市': 'chofu' };
  const SLOT_MINUTES = 15;
  const SLOT_WIDTH = 25;
  const TOTAL_HOURS = 72;
  const TOTAL_SLOTS = (TOTAL_HOURS * 60) / SLOT_MINUTES;

  /** Fetch data from GAS and return array of objects with keys: city, station, model, plate, status */
  async function fetchData() {
    try {
      const res = await fetch(GAS_URL + '?action=pull&_=' + Date.now());
      const text = await res.text();
      const cleaned = text.replace(/^\ufeff/, '');
      const json = JSON.parse(cleaned);
      let rows = [];
      // Accept json.data or json.values or array of objects
      if (Array.isArray(json)) {
        rows = json;
      } else if (Array.isArray(json.data)) {
        rows = json.data;
      } else if (Array.isArray(json.values)) {
        rows = json.values;
      } else {
        rows = [];
      }
      // If rows is array of arrays, map using column positions A: city, B: station, C: model, D: plate, F: status
      if (rows.length > 0 && Array.isArray(rows[0])) {
        // Check header row: if contains 'city', 'station' etc then skip
        const lower = rows[0].map(v => (typeof v === 'string' ? v.trim().toLowerCase() : ''));
        let startIndex = 0;
        if (lower.includes('city') || lower.includes('station')) {
          startIndex = 1;
        }
        const result = [];
        for (let i = startIndex; i < rows.length; i++) {
          const r = rows[i];
          const city = r[0] || '';
          const station = r[1] || '';
          const model = r[2] || '';
          const plate = r[3] || '';
          const status = r[5] || '';
          result.push({ city, station, model, plate, status });
        }
        return result;
      }
      // Else rows may be array of objects with keys
      return rows.map(obj => {
        return {
          city: obj.city || obj.City || obj['city'] || '',
          station: obj.station || obj.Station || obj['station'] || '',
          model: obj.model || obj.Model || obj['model'] || '',
          plate: obj.plate || obj.Plate || obj['plate'] || obj.number || '',
          status: obj.status || obj.Status || obj['status'] || ''
        };
      });
    } catch (err) {
      console.error('fetch error', err);
      return [];
    }
  }

  /** Categorize vehicles by area slug using city and status filter */
  function categorizeVehicles(rows) {
    const cats = { yamato: [], ebina: [], chofu: [] };
    rows.forEach(item => {
      const status = String(item.status || '').trim().toLowerCase();
      if (status !== 'standby') return;
      const city = String(item.city || '').trim();
      const slug = AREA_MAP[city];
      if (slug) {
        cats[slug].push({ name: `${item.station} - ${item.model} - ${item.plate}`, schedules: [] });
      }
    });
    return cats;
  }

  /** Store categories in localStorage */
  function storeVehicles(cats) {
    for (const slug of Object.keys(cats)) {
      localStorage.setItem('vehicles:' + slug, JSON.stringify(cats[slug]));
    }
  }

  /** Retrieve vehicles for area slug from localStorage */
  function loadVehicles(slug) {
    try {
      const s = localStorage.getItem('vehicles:' + slug);
      if (!s) return [];
      const arr = JSON.parse(s);
      return Array.isArray(arr) ? arr : [];
    } catch (err) {
      return [];
    }
  }

  /** Update counts on index page */
  function updateCounts(cats) {
    for (const slug of Object.keys(cats)) {
      const countEl = document.getElementById('count-' + slug);
      if (countEl) countEl.textContent = cats[slug].length;
    }
  }

  /** Initialize index page */
  async function initIndex() {
    const statusEl = document.getElementById('fetchStatus');
    if (statusEl) statusEl.textContent = '読み込み中…';
    const rows = await fetchData();
    const cats = categorizeVehicles(rows);
    storeVehicles(cats);
    updateCounts(cats);
    if (statusEl) statusEl.textContent = '';
  }

  /** Initialize area page */
  async function initArea() {
    // areaSlug defined in page script
    if (!window.areaSlug) return;
    let vehicles = loadVehicles(areaSlug);
    // Fallback: if no vehicles in storage, fetch again and categorize
    if (!vehicles || vehicles.length === 0) {
      const rows = await fetchData();
      const cats = categorizeVehicles(rows);
      storeVehicles(cats);
      vehicles = cats[areaSlug] || [];
    }
    const data = { area: window.areaName || areaSlug, vehicles: [] };
    if (vehicles && vehicles.length > 0) {
      data.vehicles = vehicles;
    } else {
      // fallback dummy vehicles
      for (let i = 1; i <= 3; i++) {
        data.vehicles.push({ name: `${window.areaName} - ${i}号車`, schedules: [] });
      }
    }
    // render schedule
    const container = document.getElementById('schedule-container');
    renderSchedule(container, data);
    setupButtons(data);
  }

  function renderSchedule(container, data) {
    if (!container) return;
    container.innerHTML = '';
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    const timelineWidth = SLOT_WIDTH * TOTAL_SLOTS;
    data.vehicles.forEach(vehicle => {
      const row = document.createElement('div');
      row.className = 'schedule-row';
      const label = document.createElement('div');
      label.className = 'vehicle-label';
      label.textContent = vehicle.name;
      row.appendChild(label);
      const timeline = document.createElement('div');
      timeline.className = 'timeline';
      timeline.style.width = timelineWidth + 'px';
      (vehicle.schedules || []).forEach((ev, idx) => {
        const start = new Date(ev.start);
        const end = new Date(ev.end);
        const startOffsetMins = (start - startOfDay) / 60000;
        const endOffsetMins = (end - startOfDay) / 60000;
        const left = (startOffsetMins / SLOT_MINUTES) * SLOT_WIDTH;
        const width = ((endOffsetMins - startOffsetMins) / SLOT_MINUTES) * SLOT_WIDTH;
        const bufferWidth = SLOT_WIDTH;
        if (left - bufferWidth >= 0) {
          const bufBefore = document.createElement('div');
          bufBefore.className = 'bar-buffer';
          bufBefore.style.left = (left - bufferWidth) + 'px';
          bufBefore.style.width = bufferWidth + 'px';
          timeline.appendChild(bufBefore);
        }
        if (left + width <= timelineWidth) {
          const bufAfter = document.createElement('div');
          bufAfter.className = 'bar-buffer';
          bufAfter.style.left = (left + width) + 'px';
          bufAfter.style.width = bufferWidth + 'px';
          timeline.appendChild(bufAfter);
        }
        const bar = document.createElement('div');
        bar.className = 'bar-reserved';
        bar.style.left = left + 'px';
        bar.style.width = width + 'px';
        bar.dataset.vehicle = vehicle.name;
        bar.dataset.index = idx;
        timeline.appendChild(bar);
      });
      row.appendChild(timeline);
      container.appendChild(row);
    });
  }

  function setupButtons(data) {
    const addBtn = document.getElementById('addBtn');
    const editBtn = document.getElementById('editBtn');
    const deleteBtn = document.getElementById('deleteBtn');
    const addVehicleSelect = document.getElementById('addVehicleSelect');
    const editVehicleSelect = document.getElementById('editVehicleSelect');
    const deleteVehicleSelect = document.getElementById('deleteVehicleSelect');
    const addStartInput = document.getElementById('addStart');
    const addEndInput = document.getElementById('addEnd');
    const editStartInput = document.getElementById('editStart');
    const editEndInput = document.getElementById('editEnd');
    const editScheduleSelect = document.getElementById('editScheduleSelect');
    const deleteScheduleSelect = document.getElementById('deleteScheduleSelect');
    const addConfirm = document.getElementById('addConfirm');
    const editConfirm = document.getElementById('editConfirm');
    const deleteConfirm = document.getElementById('deleteConfirm');

    function populateVehicleSelects() {
      [addVehicleSelect, editVehicleSelect, deleteVehicleSelect].forEach(sel => {
        if (!sel) return;
        sel.innerHTML = '';
        data.vehicles.forEach((v, idx) => {
          const option = new Option(v.name, idx);
          sel.appendChild(option);
        });
      });
    }

    function updateScheduleOptions(vehicleIndex, selectElement) {
      if (!selectElement) return;
      selectElement.innerHTML = '';
      const schedules = data.vehicles[vehicleIndex]?.schedules || [];
      schedules.forEach((ev, idx) => {
        const start = new Date(ev.start);
        const end = new Date(ev.end);
        const label = `${start.toLocaleString()} - ${end.toLocaleString()}`;
        selectElement.appendChild(new Option(label, idx));
      });
    }

    populateVehicleSelects();

    if (addBtn) {
      addBtn.addEventListener('click', () => openModal('addModal'));
    }
    if (addConfirm) {
      addConfirm.addEventListener('click', () => {
        const vIndex = parseInt(addVehicleSelect.value);
        const startVal = addStartInput.value;
        const endVal = addEndInput.value;
        if (!startVal || !endVal) {
          alert('開始と終了を入力してください。');
          return;
        }
        const start = new Date(startVal);
        const end = new Date(endVal);
        if (start >= end) {
          alert('終了は開始より後に設定してください。');
          return;
        }
        data.vehicles[vIndex].schedules = data.vehicles[vIndex].schedules || [];
        data.vehicles[vIndex].schedules.push({ start: start.toISOString(), end: end.toISOString() });
        closeModal('addModal');
        renderSchedule(document.getElementById('schedule-container'), data);
        populateVehicleSelects();
      });
    }

    if (editBtn) {
      editBtn.addEventListener('click', () => {
        populateVehicleSelects();
        updateScheduleOptions(editVehicleSelect.value, editScheduleSelect);
        openModal('editModal');
      });
    }
    if (editVehicleSelect) {
      editVehicleSelect.addEventListener('change', e => {
        updateScheduleOptions(e.target.value, editScheduleSelect);
      });
    }
    if (editConfirm) {
      editConfirm.addEventListener('click', () => {
        const vIndex = parseInt(editVehicleSelect.value);
        const sIndex = parseInt(editScheduleSelect.value);
        const startVal = editStartInput.value;
        const endVal = editEndInput.value;
        if (!startVal || !endVal) {
          alert('開始と終了を入力してください。');
          return;
        }
        const start = new Date(startVal);
        const end = new Date(endVal);
        if (start >= end) {
          alert('終了は開始より後に設定してください。');
          return;
        }
        const target = data.vehicles[vIndex]?.schedules[sIndex];
        if (target) {
          target.start = start.toISOString();
          target.end = end.toISOString();
        }
        closeModal('editModal');
        renderSchedule(document.getElementById('schedule-container'), data);
      });
    }

    if (deleteBtn) {
      deleteBtn.addEventListener('click', () => {
        populateVehicleSelects();
        updateScheduleOptions(deleteVehicleSelect.value, deleteScheduleSelect);
        openModal('deleteModal');
      });
    }
    if (deleteVehicleSelect) {
      deleteVehicleSelect.addEventListener('change', e => {
        updateScheduleOptions(e.target.value, deleteScheduleSelect);
      });
    }
    if (deleteConfirm) {
      deleteConfirm.addEventListener('click', () => {
        const vIndex = parseInt(deleteVehicleSelect.value);
        const sIndex = parseInt(deleteScheduleSelect.value);
        if (!isNaN(vIndex) && !isNaN(sIndex)) {
          data.vehicles[vIndex].schedules.splice(sIndex, 1);
        }
        closeModal('deleteModal');
        renderSchedule(document.getElementById('schedule-container'), data);
      });
    }
  }

  // Modal helper functions
  window.openModal = function(id) {
    const modal = document.getElementById(id);
    if (modal) modal.style.display = 'flex';
  };
  window.closeModal = function(id) {
    const modal = document.getElementById(id);
    if (modal) modal.style.display = 'none';
  };

  // Expose init functions globally
  window.Junkai = {
    initIndex,
    initArea
  };
})();
