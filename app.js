(function () {
    const SLOT_WIDTH = 50; // px per 30-minute slot
    const TOTAL_HOURS = 72;
    const TOTAL_SLOTS = TOTAL_HOURS * 2;

    function init() {
        const container = document.getElementById('schedule-container');
        if (!container || typeof scheduleData === 'undefined') {
            return;
        }
        const title = document.getElementById('area-title');
        if (title) title.textContent = scheduleData.area + 'エリア スケジュール';
        renderSchedule(container, scheduleData);
        setupButtons(scheduleData);
    }

    function renderSchedule(container, data) {
        container.innerHTML = '';
        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
        const timelineWidth = SLOT_WIDTH * TOTAL_SLOTS;
        data.vehicles.forEach((vehicle) => {
            const row = document.createElement('div');
            row.className = 'schedule-row';

            const label = document.createElement('div');
            label.className = 'vehicle-label';
            label.textContent = vehicle.name;
            row.appendChild(label);

            const timeline = document.createElement('div');
            timeline.className = 'timeline';
            timeline.style.width = timelineWidth + 'px';

            vehicle.schedules.forEach((ev, idx) => {
                const start = new Date(ev.start);
                const end = new Date(ev.end);
                const startOffsetMins = (start - startOfDay) / 60000;
                const endOffsetMins = (end - startOfDay) / 60000;
                const left = (startOffsetMins / 30) * SLOT_WIDTH;
                const width = ((endOffsetMins - startOffsetMins) / 30) * SLOT_WIDTH;
                const bufferWidth = SLOT_WIDTH / 2;
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
        const addModal = document.getElementById('addModal');
        const addVehicleSelect = document.getElementById('addVehicleSelect');
        const addStartInput = document.getElementById('addStart');
        const addEndInput = document.getElementById('addEnd');
        const addConfirm = document.getElementById('addConfirm');

        const editBtn = document.getElementById('editBtn');
        const editModal = document.getElementById('editModal');
        const editVehicleSelect = document.getElementById('editVehicleSelect');
        const editScheduleSelect = document.getElementById('editScheduleSelect');
        const editStartInput = document.getElementById('editStart');
        const editEndInput = document.getElementById('editEnd');
        const editConfirm = document.getElementById('editConfirm');

        const deleteBtn = document.getElementById('deleteBtn');
        const deleteModal = document.getElementById('deleteModal');
        const deleteVehicleSelect = document.getElementById('deleteVehicleSelect');
        const deleteScheduleSelect = document.getElementById('deleteScheduleSelect');
        const deleteConfirm = document.getElementById('deleteConfirm');

        function populateVehicleSelects() {
            [addVehicleSelect, editVehicleSelect, deleteVehicleSelect].forEach((sel) => {
                sel.innerHTML = '';
                data.vehicles.forEach((v, idx) => {
                    const option = new Option(v.name, idx);
                    sel.appendChild(option);
                });
            });
        }

        function updateScheduleOptions(vehicleIndex, selectElement) {
            selectElement.innerHTML = '';
            const schedules = data.vehicles[vehicleIndex].schedules;
            schedules.forEach((ev, idx) => {
                const start = new Date(ev.start);
                const end = new Date(ev.end);
                const label = `${start.toLocaleString()} - ${end.toLocaleString()}`;
                selectElement.appendChild(new Option(label, idx));
            });
        }

        populateVehicleSelects();

        // Add
        if (addBtn) {
            addBtn.addEventListener('click', () => {
                openModal('addModal');
            });
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
                data.vehicles[vIndex].schedules.push({ start: start.toISOString(), end: end.toISOString() });
                closeModal('addModal');
                renderSchedule(document.getElementById('schedule-container'), data);
                populateVehicleSelects();
            });
        }

        // Edit
        if (editBtn) {
            editBtn.addEventListener('click', () => {
                populateVehicleSelects();
                updateScheduleOptions(editVehicleSelect.value, editScheduleSelect);
                openModal('editModal');
            });
        }
        if (editVehicleSelect) {
            editVehicleSelect.addEventListener('change', (e) => {
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
                const target = data.vehicles[vIndex].schedules[sIndex];
                if (target) {
                    target.start = start.toISOString();
                    target.end = end.toISOString();
                }
                closeModal('editModal');
                renderSchedule(document.getElementById('schedule-container'), data);
            });
        }

        // Delete
        if (deleteBtn) {
            deleteBtn.addEventListener('click', () => {
                populateVehicleSelects();
                updateScheduleOptions(deleteVehicleSelect.value, deleteScheduleSelect);
                openModal('deleteModal');
            });
        }
        if (deleteVehicleSelect) {
            deleteVehicleSelect.addEventListener('change', (e) => {
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

    window.openModal = function (id) {
        const modal = document.getElementById(id);
        if (modal) modal.style.display = 'flex';
    };
    window.closeModal = function (id) {
        const modal = document.getElementById(id);
        if (modal) modal.style.display = 'none';
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
