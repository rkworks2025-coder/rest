(() => {
  const GAS_URL = 'https://script.google.com/macros/s/AKfycby9RpFiUbYu6YX6JW9XfwbDx36_4AIlGEQMOxR3SnxgNdoRUJKfyxvF3b1SEYwuHb3X/exec';
  const AREA_MAP = { '大和市': 'yamato', '海老名市': 'ebina', '調布市': 'chofu' };
  const SLOT_MINUTES = 15;
  const SLOT_WIDTH = 25;
  const TOTAL_HOURS = 72;
  const TOTAL_SLOTS = (TOTAL_HOURS * 60) / SLOT_MINUTES;

  /**
   * GAS からデータを取得し、共通フォーマットに整形します。
   *
   * - URL は ?action=pull 付きでアクセスします。
   * - json.data / json.values / ルート配列のいずれかを受理します。
   * - 返却が 2 次元配列の場合はヘッダー行を自動判定し、列をマッピングします。
   * - オブジェクト配列の場合は city/station/model/plate/number/status の揺れを吸収します。
   */
  async function fetchData() {
    // Helper to call GAS with arbitrary query and parse response into rows (array)
    async function callGAS(query) {
      const url = `${GAS_URL}?${query}&_=${Date.now()}`;
      try {
        const res = await fetch(url, { method: 'GET', cache: 'no-store' });
        const raw = await res.text();
        const cleaned = raw.replace(/^\ufeff/, '');
        let json;
        try {
          json = JSON.parse(cleaned);
        } catch (e) {
          return [];
        }
        let rows;
        if (Array.isArray(json)) {
          rows = json;
        } else if (Array.isArray(json.data)) {
          rows = json.data;
        } else if (Array.isArray(json.values)) {
          rows = json.values;
        } else {
          rows = [];
        }
        if ((!rows || rows.length === 0) && Array.isArray(json) && Array.isArray(json[0])) {
          rows = json;
        }
        return rows;
      } catch (err) {
        return [];
      }
    }
    // このアプリは inspectionlog タブからのみデータを取得します。
    // v6w とは異なるタブ名のため、考えられるクエリを複数試行します。
    const queries = [
      'action=pullInspectionlog',
      'action=pullinspectionlog',
      'action=pull_inspectionlog',
      'action=pullLog',
      'action=inspectionlog',
      'action=pull&sheet=inspectionlog',
      'action=pull&tab=inspectionlog',
      'sheet=inspectionlog',
      'tab=inspectionlog',
      'action=pull'
    ];
    let rows = [];
    for (const q of queries) {
      rows = await callGAS(q);
      if (rows && rows.length > 0) break;
    }
    if (!rows || rows.length === 0) {
      return [];
    }
    // Now transform rows into array of objects
    const result = [];
    if (Array.isArray(rows[0])) {
      // 2D array. detect header row with city/station pattern
      let headerMap = null;
      const first = rows[0];
      if (Array.isArray(first)) {
        const lower = first.map(x => (typeof x === 'string' ? x.trim().toLowerCase() : ''));
        if (lower.some(x => x.includes('city')) && lower.some(x => x.includes('station'))) {
          headerMap = {};
          for (let i = 0; i < lower.length; i++) {
            const col = lower[i];
            if (col.includes('city')) headerMap.city = i;
            else if (col.includes('station')) headerMap.station = i;
            else if (col.includes('model')) headerMap.model = i;
            else if (col.includes('plate') || col.includes('number')) headerMap.plate = i;
            else if (col.includes('status')) headerMap.status = i;
          }
          // skip header row
          rows = rows.slice(1);
        }
      }
      for (const r of rows) {
        if (!Array.isArray(r)) continue;
        let city = '';
        let station = '';
        let model = '';
        let plate = '';
        let status = '';
        if (headerMap) {
          city = r[headerMap.city ?? 0] || '';
          station = r[headerMap.station ?? 1] || '';
          model = r[headerMap.model ?? 2] || '';
          plate = r[headerMap.plate ?? 3] || '';
          status = r[headerMap.status ?? 4] || '';
        } else {
          // heuristic: A=city, B=station, C=model, D=plate, F=status
          city = r[0] || '';
          station = r[1] || '';
          model = r[2] || '';
          plate = r[3] || '';
          // status may be at 4 or 5 depending on header presence
          status = r[5] || r[4] || '';
        }
        result.push({
          city: String(city).trim(),
          station: String(station).trim(),
          model: String(model).trim(),
          plate: String(plate).trim(),
          status: String(status).trim(),
        });
      }
      return result;
    }
    // handle array of objects
    return rows.map(obj => {
      return {
        city: String(obj.city ?? obj.City ?? obj.city_name ?? '').trim(),
        station: String(obj.station ?? obj.Station ?? obj.station_name ?? '').trim(),
        model: String(obj.model ?? obj.Model ?? obj.car_model ?? '').trim(),
        plate: String(obj.plate ?? obj.Plate ?? obj.number ?? obj.Number ?? '').trim(),
        status: String(obj.status ?? obj.Status ?? obj.state ?? '').trim(),
      };
    });
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
        const station = String(item.station || '').trim();
        const model = String(item.model || '').trim();
        // plate/number の揺れを吸収
        const plate = String(item.plate || item.number || '').trim();
        cats[slug].push({ name: `${station} - ${model} - ${plate}`, schedules: [] });
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
