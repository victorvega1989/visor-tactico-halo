// GLOBALES
window.onerror = function(m,u,l,c,e){ alert('JS ERROR: ' + m + ' Line: ' + l); };
    let warscrollDatabase = [];
    let squads = [];
    try {
      const savedSquads = JSON.parse(localStorage.getItem('haloFlashpointSquads'));
      if (Array.isArray(savedSquads) && savedSquads.length > 0) {
        squads = savedSquads;
      }
    } catch (e) {
      console.warn('Error reading squads from localStorage, using default:', e);
    }
    if (squads.length === 0) {
      squads = [
        { id: 'sq_default', name: 'Escuadra Alpha', mode: 'wargame', pointsLimit: 200, orders: [], upgrades: [], units: [] }
      ];
    }
    // Asegurar estructura de escuadras anteriores
    squads.forEach(s => {
      if (!s) return;
      if (!s.mode) s.mode = 'wargame';
      if (s.pointsLimit === undefined) s.pointsLimit = 200;
      if (!s.orders) s.orders = [];
      if (!s.upgrades) s.upgrades = [];
      if (!s.units) s.units = [];
    });
    let activeSquadId = localStorage.getItem('haloFlashpointActiveSquad') || squads[0].id;
    if (!squads.find(s => s && s.id === activeSquadId)) activeSquadId = squads[0].id;
    let currentTab = 'DB'; 
    let currentSelectedId = null;
    let activeLoadoutUnitUid = null;

    // DOM
    const factionSelect = document.getElementById('factionSelect');
    const searchUnit = document.getElementById('searchUnit');
    const unitList = document.getElementById('unitList');
    const squadList = document.getElementById('squadList');
    const mainContainer = document.getElementById('mainContainer');
    const printContainer = document.getElementById('printContainer');
    const excelFileInput = document.getElementById('excelFileInput');
    const emptyStateHTML = document.getElementById('emptyState').outerHTML;
    
    const tabDB = document.getElementById('tabDB');
    const tabSquad = document.getElementById('tabSquad');
    const viewDB = document.getElementById('viewDB');
    const viewSquad = document.getElementById('viewSquad');
    
    const squadSelector = document.getElementById('squadSelector');
    const btnEditSquad = document.getElementById('btnEditSquad');
    const btnNewSquad = document.getElementById('btnNewSquad');
    const btnDelSquad = document.getElementById('btnDelSquad');
    const squadPointsTotal = document.getElementById('squadPointsTotal');
    const btnClearSquad = document.getElementById('btnClearSquad');

    const helpModal = document.getElementById('helpModal');
    const btnOpenHelp = document.getElementById('btnOpenHelp');
    const btnCloseHelp = document.getElementById('btnCloseHelp');
    const btnOpenHelpEmpty = document.getElementById('btnOpenHelpEmpty');

    function openModal() { helpModal.classList.add('active'); }
    function closeModal() { helpModal.classList.remove('active'); }
    if (btnOpenHelp) btnOpenHelp.addEventListener('click', openModal);
    if (btnCloseHelp) btnCloseHelp.addEventListener('click', closeModal);
    if(btnOpenHelpEmpty) btnOpenHelpEmpty.addEventListener('click', openModal);
    helpModal.addEventListener('click', (e) => { if(e.target === helpModal) closeModal(); });
    const selectSquadModalEl = document.getElementById('selectSquadModal');
    if(selectSquadModalEl) {
      selectSquadModalEl.addEventListener('click', (e) => { if(e.target === selectSquadModalEl) closeSelectSquadModal(); });
    }

    // TABS
    tabDB.addEventListener('click', () => {
      currentTab = 'DB';
      tabDB.classList.add('active'); tabSquad.classList.remove('active');
      viewDB.style.display = 'flex'; viewSquad.style.display = 'none';
      mainContainer.innerHTML = emptyStateHTML;
      document.getElementById('btnOpenHelpEmpty')?.addEventListener('click', openModal);
      currentSelectedId = null;
      renderUnitList();
    });

    tabSquad.addEventListener('click', () => {
      currentTab = 'SQUAD';
      tabSquad.classList.add('active'); tabDB.classList.remove('active');
      viewSquad.style.display = 'flex'; viewDB.style.display = 'none';
      mainContainer.innerHTML = emptyStateHTML;
      document.getElementById('btnOpenHelpEmpty')?.addEventListener('click', openModal);
      currentSelectedId = null;
      renderSquadSelector();
    });

    // ESCUADRAS LÓGICA Y CÁLCULO DE PUNTOS
    function saveSquads() {
      localStorage.setItem('haloFlashpointSquads', JSON.stringify(squads));
      localStorage.setItem('haloFlashpointActiveSquad', activeSquadId);
    }

    function getSquadTotalPoints(squad) {
      if (!squad) return { total: 0, units: 0, orders: 0, upgrades: 0 };
      const isDraft = (squad.mode || '').toLowerCase() === 'draft';

      let unitsCost = (squad.units || []).reduce((acc, u) => {
        let cost = (!isDraft && u.totalCost !== undefined) ? u.totalCost : (parseInt(u.cost, 10) || 0);
        return acc + cost;
      }, 0);

      let ordersCost = 0;
      let upgradesCost = 0;

      if (!isDraft) {
        const ordersList = (window.FLASHPOINT_DATA && window.FLASHPOINT_DATA.wargame && window.FLASHPOINT_DATA.wargame.orders) || [];
        (squad.orders || []).forEach(ordName => {
          const found = ordersList.find(o => o.name === ordName);
          if (found) ordersCost += (found.cost || 0);
        });

        const upgradesList = (window.FLASHPOINT_DATA && window.FLASHPOINT_DATA.wargame && window.FLASHPOINT_DATA.wargame.upgrades) || [];
        (squad.upgrades || []).forEach(upgName => {
          const found = upgradesList.find(u => u.name === upgName);
          if (found) upgradesCost += (found.cost || 0);
        });
      }

      return {
        total: unitsCost + ordersCost + upgradesCost,
        units: unitsCost,
        orders: ordersCost,
        upgrades: upgradesCost
      };
    }

    window.setSquadMode = function(mode) {
      const active = squads.find(s => s.id === activeSquadId);
      if (active) {
        active.mode = mode;
        saveSquads();
        syncSquadModeUI();
        renderSquadList();
        if (currentSelectedId) {
          const selectedUnit = active.units.find(u => u.uniqueUid === currentSelectedId);
          if (selectedUnit) renderDatacard(selectedUnit, 'SQUAD');
        }
      }
    };

    window.setSquadPointsLimit = function(limit) {
      const active = squads.find(s => s.id === activeSquadId);
      if (active) {
        active.pointsLimit = parseInt(limit, 10) || 0;
        saveSquads();
        renderSquadList();
      }
    };

    function syncSquadModeUI() {
      const active = squads.find(s => s.id === activeSquadId);
      const isWargame = active && (active.mode || '').toLowerCase() === 'wargame';
      const btnDraft = document.getElementById('btnModeDraft');
      const btnWargame = document.getElementById('btnModeWargame');
      const limitSelect = document.getElementById('limitSelect');
      const limitGroup = document.querySelector('.limit-selector-group');
      const btnOrders = document.getElementById('btnOpenOrdersModal');

      if (btnDraft && btnWargame) {
        if (isWargame) {
          btnWargame.classList.add('active');
          btnDraft.classList.remove('active');
          if (btnOrders) btnOrders.style.display = 'block';
          if (limitGroup) limitGroup.style.display = 'flex';
        } else {
          btnDraft.classList.add('active');
          btnWargame.classList.remove('active');
          if (btnOrders) btnOrders.style.display = 'none';
          if (limitGroup) limitGroup.style.display = 'none';
        }
      }
      if (limitSelect && active) {
        limitSelect.value = String(active.pointsLimit !== undefined ? active.pointsLimit : 200);
      }
    }

    function renderSquadSelector() {
      squadSelector.innerHTML = '';
      squads.forEach(s => {
        let opt = document.createElement('option');
        opt.value = s.id; opt.textContent = s.name;
        if (s.id === activeSquadId) opt.selected = true;
        squadSelector.appendChild(opt);
      });
      syncSquadModeUI();
      renderSquadList();
    }

    squadSelector.addEventListener('change', (e) => {
      activeSquadId = e.target.value;
      saveSquads();
      syncSquadModeUI();
      renderSquadList();
      mainContainer.innerHTML = emptyStateHTML;
    });

    btnEditSquad.addEventListener('click', () => {
      let active = squads.find(s => s && s.id === activeSquadId);
      if (!active) return;
      let newName = prompt('Ingresa el nuevo nombre para esta Escuadra Operativa:', active.name);
      if (newName !== null && newName.trim() !== '') {
        active.name = newName.trim();
        saveSquads();
        renderSquadSelector();
      }
    });

    btnNewSquad.addEventListener('click', () => {
      let name = prompt('Ingresa el nombre de tu nueva Escuadra Operativa:');
      if(name && name.trim() !== '') {
        let newId = 'sq_' + Date.now();
        squads.push({ id: newId, name: name.trim(), mode: 'wargame', pointsLimit: 200, orders: [], upgrades: [], units: [] });
        activeSquadId = newId; saveSquads(); renderSquadSelector(); mainContainer.innerHTML = emptyStateHTML;
      }
    });

    btnDelSquad.addEventListener('click', () => {
      if(squads.length === 1) { alert('Comando denegado: No puedes borrar tu única escuadra. Utiliza [VACIAR ESCUADRA] en su lugar.'); return; }
      if(confirm('¿Seguro que deseas eliminar esta Escuadra permanentemente?')) {
        squads = squads.filter(s => s.id !== activeSquadId);
        activeSquadId = squads[0].id; saveSquads(); renderSquadSelector(); mainContainer.innerHTML = emptyStateHTML;
      }
    });

    btnClearSquad.addEventListener('click', () => {
      if(confirm('¿Purgar todos los operativos de la escuadra actual?')) {
        let active = squads.find(s => s.id === activeSquadId);
        active.units = [];
        active.orders = [];
        active.upgrades = [];
        saveSquads(); renderSquadList(); mainContainer.innerHTML = emptyStateHTML;
      }
    });

    // LISTAS UI
    function updateFactionDropdown() {
      const factions = [...new Set(warscrollDatabase.map(u => u.faction || "Sin Asignar"))].sort();
      const currentVal = factionSelect.value;
      factionSelect.innerHTML = '<option value="ALL">-- Base de Datos Completa --</option>';
      factions.forEach(f => {
        const opt = document.createElement('option');
        opt.value = f; opt.textContent = f; factionSelect.appendChild(opt);
      });
      if (factions.includes(currentVal)) factionSelect.value = currentVal;
    }

    function renderUnitList() {
      const selectedFaction = factionSelect.value;
      const term = searchUnit.value.trim().toLowerCase();
      unitList.innerHTML = '';
      const filtered = warscrollDatabase.filter(u => {
        const matchesFaction = selectedFaction === 'ALL' || u.faction === selectedFaction;
        const matchesSearch = !term || u.name.toLowerCase().includes(term);
        return matchesFaction && matchesSearch;
      });
      if (filtered.length === 0) { unitList.innerHTML = '<li style="padding:15px;color:#425870;text-align:center;">Sin resultados</li>'; return; }

      filtered.forEach(unit => {
        const isBan = (unit.faction || '').toLowerCase().includes('banished');
        const fIcon = isBan ? '<span class="ui-icon icon-banished"></span>' : '<span class="ui-icon icon-unsc"></span>';
        const li = document.createElement('li');
        li.className = `unit-item ${unit.id === currentSelectedId ? 'active' : ''}`;
        li.onclick = () => renderDatacard(unit, 'DB');
        li.innerHTML = `
          <div class="unit-item-name">${unit.name}</div>
          <div class="unit-item-meta">
            <span>${fIcon} ${unit.faction}</span>
            <span style="color:#8df5a0;font-weight:700;">${unit.cost} PTS</span>
          </div>
        `;
        unitList.appendChild(li);
      });
    }

    function renderSquadList() {
      squadList.innerHTML = '';
      let activeSquad = squads.find(s => s.id === activeSquadId);
      if (!activeSquad || activeSquad.units.length === 0) {
        squadList.innerHTML = '<li style="padding:15px;color:#425870;text-align:center;">Escuadra vacía</li>';
        const isWargame = activeSquad && (activeSquad.mode || '').toLowerCase() === 'wargame';
        const lim = activeSquad && activeSquad.pointsLimit !== undefined ? activeSquad.pointsLimit : 200;
        squadPointsTotal.innerHTML = isWargame ? `0 <span>/ ${lim > 0 ? lim + ' PTS' : 'LIBRE'}</span>` : `0 <span>PTS (DRAFT)</span>`;
        updateSquadStatusBadges(activeSquad, 0);
        return;
      }

      const isWargame = (activeSquad.mode || '').toLowerCase() === 'wargame';
      const pts = getSquadTotalPoints(activeSquad);
      const limit = activeSquad.pointsLimit !== undefined ? activeSquad.pointsLimit : 200;
      squadPointsTotal.innerHTML = isWargame ? `${pts.total} <span>/ ${limit > 0 ? limit + ' PTS' : 'LIBRE'}</span>` : `${pts.total} <span>PTS (DRAFT)</span>`;
      updateSquadStatusBadges(activeSquad, pts.total);

      activeSquad.units.forEach(unit => {
        const uCost = (isWargame && unit.totalCost !== undefined) ? unit.totalCost : (parseInt(unit.cost, 10) || 0);
        const isBan = (unit.faction || '').toLowerCase().includes('banished');
        const fIcon = isBan ? '<span class="ui-icon icon-banished"></span>' : '<span class="ui-icon icon-unsc"></span>';

        let badgesHtml = '';
        if (isWargame) {
          if (unit.customWeapons && unit.customWeapons.length > 0) {
            badgesHtml += `<span class="unit-loadout-pill">🔫 ${unit.customWeapons.map(w => w.name).join(', ')}</span>`;
          }
          if (unit.customGrenade) {
            badgesHtml += `<span class="unit-gear-pill">💣 ${unit.customGrenade.name} (+${unit.customGrenade.cost}P)</span>`;
          }
          if (unit.customItem) {
            badgesHtml += `<span class="unit-gear-pill">🎒 ${unit.customItem.name} (+${unit.customItem.cost}P)</span>`;
          }
        } else {
          badgesHtml = `<span class="unit-loadout-pill" style="border-color:rgba(141,245,160,0.3); color:#8df5a0;">MODO DRAFT (BASE)</span>`;
        }

        const li = document.createElement('li');
        li.className = `unit-item ${unit.uniqueUid === currentSelectedId ? 'active' : ''}`;
        li.onclick = () => renderDatacard(unit, 'SQUAD');
        li.innerHTML = `
          <div class="unit-item-name">${unit.name}</div>
          <div class="unit-item-meta">
            <span>${fIcon} ${unit.faction}</span>
            <span style="color:#8df5a0;font-weight:700;">${uCost} PTS</span>
          </div>
          ${badgesHtml ? `<div class="unit-item-badges">${badgesHtml}</div>` : ''}
        `;
        squadList.appendChild(li);
      });
    }

    function updateSquadStatusBadges(squad, totalPts) {
      const container = document.getElementById('squadStatusBadges');
      if (!container || !squad) return;
      container.innerHTML = '';
      if ((squad.mode || '').toLowerCase() !== 'wargame') {
        const count = squad.units ? squad.units.length : 0;
        container.innerHTML = `<span class="status-badge" style="background:rgba(0,210,255,0.08); border-color:var(--border-cyan); color:var(--text-cyan);">MODO DRAFT (${count} MODELOS - ARMAS DE SERIE)</span>`;
        return;
      }

      const limit = squad.pointsLimit !== undefined ? squad.pointsLimit : 200;
      const count = squad.units ? squad.units.length : 0;

      if (limit > 0) {
        if (totalPts <= limit) {
          container.innerHTML += `<span class="status-badge ok">✓ DENTRO DEL LÍMITE (${limit - totalPts} libres)</span>`;
        } else {
          container.innerHTML += `<span class="status-badge warn">⚠️ SUPERA EL LÍMITE (+${totalPts - limit} PTS)</span>`;
        }
      }

      if (count >= 3) {
        container.innerHTML += `<span class="status-badge ok">✓ ${count} MODELOS (COMPETITIVO)</span>`;
      } else {
        container.innerHTML += `<span class="status-badge warn">⚠️ ${count} MODELOS (MÍNIMO 3)</span>`;
      }
    }

    let pendingUnitToAdd = null;

    window.addUnitToSquad = function(unitId) {
      let unit = warscrollDatabase.find(u => u.id === unitId);
      if (!unit) return;

      if (!squads || squads.length <= 1) {
        let target = (squads && squads.length === 1) ? squads[0] : squads.find(s => s && s.id === activeSquadId);
        if (target) {
          doAddUnitToSquad(unit, target.id);
        }
      } else {
        pendingUnitToAdd = unit;
        openSelectSquadModal(unit);
      }
    };

    function doAddUnitToSquad(unit, targetSquadId) {
      let targetSquad = squads.find(s => s && s.id === targetSquadId);
      if (!targetSquad) return;
      if (!targetSquad.units) targetSquad.units = [];

      let clone = JSON.parse(JSON.stringify(unit));
      clone.uniqueUid = 'uid-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
      clone.baseWeapons = JSON.parse(JSON.stringify(unit.weapons || []));
      clone.totalCost = parseInt(clone.cost, 10) || 0;
      targetSquad.units.push(clone);

      saveSquads();

      if (targetSquad.id === activeSquadId) {
        renderSquadList();
      }

      let btn = document.getElementById('btnAddSquad');
      if (btn) {
        let originalText = btn.innerText;
        btn.innerText = `[ AÑADIDO A ${targetSquad.name.toUpperCase()} ✔ ]`;
        btn.style.background = "#187175";
        btn.style.color = "#fff";
        setTimeout(() => {
          btn.innerText = originalText;
          btn.style.background = "";
          btn.style.color = "";
        }, 1300);
      }
    }

    window.openSelectSquadModal = function(unit) {
      const modal = document.getElementById('selectSquadModal');
      const container = document.getElementById('squadCardsContainer');
      const sub = document.getElementById('selectSquadModalSub');
      if (!modal || !container) return;

      if (sub && unit) {
        sub.innerHTML = `Selecciona la escuadra de destino para <strong>${unit.name}</strong> (${unit.cost} PTS):`;
      }

      container.innerHTML = '';
      squads.forEach(s => {
        const isActive = s.id === activeSquadId;
        const isWargame = (s.mode || '').toLowerCase() === 'wargame';
        const count = s.units ? s.units.length : 0;
        const pts = getSquadTotalPoints(s);
        const limitStr = (s.pointsLimit && s.pointsLimit > 0) ? `${s.pointsLimit} PTS` : 'LIBRE';

        const card = document.createElement('div');
        card.className = 'squad-pick-card';
        card.onclick = () => {
          confirmAddUnitToSquad(s.id);
        };
        card.innerHTML = `
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
            <div style="font-family:'Rajdhani', sans-serif; font-size:1.25rem; font-weight:700; color:#fff;">
              ${s.name} ${isActive ? '<span class="squad-active-tag">ACTUAL</span>' : ''}
            </div>
            <span class="mode-badge ${isWargame ? 'wg' : 'draft'}">${(s.mode || 'wargame').toUpperCase()}</span>
          </div>
          <div style="display:flex; justify-content:space-between; font-family:'Share Tech Mono', monospace; font-size:0.8rem; color:#7b96b3;">
            <span>👥 ${count} MODELOS</span>
            <span style="color:#8df5a0; font-weight:bold;">${pts.total} / ${limitStr}</span>
          </div>
        `;
        container.appendChild(card);
      });

      modal.classList.add('active');
    };

    window.closeSelectSquadModal = function() {
      const modal = document.getElementById('selectSquadModal');
      if (modal) modal.classList.remove('active');
      pendingUnitToAdd = null;
    };

    window.confirmAddUnitToSquad = function(targetSquadId) {
      if (pendingUnitToAdd) {
        doAddUnitToSquad(pendingUnitToAdd, targetSquadId);
      }
      closeSelectSquadModal();
    };

    window.removeUnitFromSquad = function(uniqueUid) {
      let active = squads.find(s => s.id === activeSquadId);
      active.units = active.units.filter(u => u.uniqueUid !== uniqueUid);
      saveSquads(); renderSquadList(); mainContainer.innerHTML = emptyStateHTML;
      document.getElementById('btnOpenHelpEmpty')?.addEventListener('click', openModal);
    };

    // MODAL LOADOUT (PERSONALIZACIÓN WARGAME)
    window.openLoadoutModal = function(uniqueUid) {
      const activeSquad = squads.find(s => s.id === activeSquadId);
      if (!activeSquad) return;
      const unit = activeSquad.units.find(u => u.uniqueUid === uniqueUid);
      if (!unit) return;
      activeLoadoutUnitUid = uniqueUid;

      if (!unit.baseWeapons) {
        unit.baseWeapons = JSON.parse(JSON.stringify(unit.weapons || []));
      }

      const modalTitle = document.getElementById('loadoutModalTitle');
      if (modalTitle) modalTitle.textContent = `CONFIGURACIÓN WARGAME: ${unit.name.toUpperCase()}`;

      const selMelee = document.getElementById('selMeleeWeapon');
      const selPrimary = document.getElementById('selPrimaryWeapon');
      const selSecondary = document.getElementById('selSecondaryWeapon');
      const selGrenade = document.getElementById('selGrenade');
      const selItem = document.getElementById('selItem');

      const weaponsList = (window.FLASHPOINT_DATA && window.FLASHPOINT_DATA.wargame && window.FLASHPOINT_DATA.wargame.weapons) || [];
      const grenadesList = (window.FLASHPOINT_DATA && window.FLASHPOINT_DATA.wargame && window.FLASHPOINT_DATA.wargame.grenades) || [];
      const itemsList = (window.FLASHPOINT_DATA && window.FLASHPOINT_DATA.wargame && window.FLASHPOINT_DATA.wargame.items) || [];

      // Identificar armas base de serie del operativo
      const baseWeapons = unit.baseWeapons || [];
      const baseCC = baseWeapons.find(w => (w.range || '').toUpperCase() === 'CC') || baseWeapons[0];
      const baseRangedList = baseWeapons.filter(w => w !== baseCC);
      const baseRanged = baseRangedList[0] || null;
      const baseSecondary = baseRangedList[1] || null;

      // Armas actualmente equipadas en customWeapons si las hay
      const currentCC = unit.customWeapons ? unit.customWeapons.find(w => (w.range || '').toUpperCase() === 'CC') : null;
      const currentRangedList = unit.customWeapons ? unit.customWeapons.filter(w => (w.range || '').toUpperCase() !== 'CC') : [];
      const currentPrimary = currentRangedList[0] || null;
      const currentSecondary = currentRangedList[1] || null;

      // 1. Selector de Arma Cuerpo a Cuerpo (Ranura CC)
      selMelee.innerHTML = '';
      const ccName = baseCC ? baseCC.name : 'Puños Base';
      selMelee.innerHTML += `<option value="__DEFAULT__">[De Serie] ${ccName} (${baseCC ? baseCC.range : 'CC'} | 0 PTS)</option>`;
      const ccCatalog = weaponsList.filter(w => (w.range || '').toUpperCase() === 'CC');
      ccCatalog.forEach(w => {
        selMelee.innerHTML += `<option value="${w.name}">${w.name} (+${w.cost} PTS | CC | AP ${w.ap})</option>`;
      });
      if (currentCC && baseCC && currentCC.name !== baseCC.name) {
        selMelee.value = currentCC.name;
      } else {
        selMelee.value = '__DEFAULT__';
      }

      // 2. Selector de Arma Principal de Disparo (Ranura Ranged)
      selPrimary.innerHTML = '';
      if (baseRanged) {
        selPrimary.innerHTML += `<option value="__DEFAULT__">[De Serie] ${baseRanged.name} (${baseRanged.range} | 0 PTS)</option>`;
      }
      selPrimary.innerHTML += `<option value="__NONE__">[Sin arma de disparo / Desarmado] (0 PTS)</option>`;
      const rangedCatalog = weaponsList.filter(w => (w.range || '').toUpperCase() !== 'CC');
      rangedCatalog.forEach(w => {
        selPrimary.innerHTML += `<option value="${w.name}">${w.name} (+${w.cost} PTS | ${w.range} | AP ${w.ap})</option>`;
      });
      if (unit.customWeapons) {
        if (currentPrimary) {
          if (baseRanged && currentPrimary.name === baseRanged.name) selPrimary.value = '__DEFAULT__';
          else selPrimary.value = currentPrimary.name;
        } else {
          selPrimary.value = '__NONE__';
        }
      } else if (baseRanged) {
        selPrimary.value = '__DEFAULT__';
      } else {
        selPrimary.value = '__NONE__';
      }

      // 3. Selector de Arma Secundaria / Respaldo
      selSecondary.innerHTML = '';
      selSecondary.innerHTML += `<option value="__NONE__">[Sin arma secundaria / Ninguna] (0 PTS)</option>`;
      if (baseSecondary) {
        selSecondary.innerHTML += `<option value="__DEFAULT__">[De Serie] ${baseSecondary.name} (${baseSecondary.range} | 0 PTS)</option>`;
      }
      weaponsList.forEach(w => {
        selSecondary.innerHTML += `<option value="${w.name}">${w.name} (+${w.cost} PTS | ${w.range} | AP ${w.ap})</option>`;
      });
      if (unit.customWeapons) {
        if (currentSecondary) {
          if (baseSecondary && currentSecondary.name === baseSecondary.name) selSecondary.value = '__DEFAULT__';
          else selSecondary.value = currentSecondary.name;
        } else {
          selSecondary.value = '__NONE__';
        }
      } else if (baseSecondary) {
        selSecondary.value = '__DEFAULT__';
      } else {
        selSecondary.value = '__NONE__';
      }

      // 4. Selector de Granadas
      selGrenade.innerHTML = '<option value="__NONE__">[Sin granada inicial] (0 PTS)</option>';
      grenadesList.forEach(g => {
        selGrenade.innerHTML += `<option value="${g.name}">${g.name} (+${g.cost} PTS | ${g.range} | AP ${g.ap})</option>`;
      });
      selGrenade.value = unit.customGrenade ? unit.customGrenade.name : '__NONE__';

      // 5. Selector de Objetos
      selItem.innerHTML = '<option value="__NONE__">[Sin objeto inicial] (0 PTS)</option>';
      itemsList.forEach(i => {
        selItem.innerHTML += `<option value="${i.name}">${i.name} (+${i.cost} PTS)</option>`;
      });
      selItem.value = unit.customItem ? unit.customItem.name : '__NONE__';

      updateLoadoutLivePoints();
      let lm = document.getElementById('loadoutModal');
      lm.classList.add('active');
    };

    window.closeLoadoutModal = function() {
      document.getElementById('loadoutModal').classList.remove('active');
      activeLoadoutUnitUid = null;
    };

    window.updateLoadoutLivePoints = function() {
      const activeSquad = squads.find(s => s.id === activeSquadId);
      if (!activeSquad || !activeLoadoutUnitUid) return;
      const unit = activeSquad.units.find(u => u.uniqueUid === activeLoadoutUnitUid);
      if (!unit) return;

      const selMelee = document.getElementById('selMeleeWeapon').value;
      const selPrimary = document.getElementById('selPrimaryWeapon').value;
      const selSecondary = document.getElementById('selSecondaryWeapon').value;
      const selGrenade = document.getElementById('selGrenade').value;
      const selItem = document.getElementById('selItem').value;

      const weaponsList = (window.FLASHPOINT_DATA && window.FLASHPOINT_DATA.wargame && window.FLASHPOINT_DATA.wargame.weapons) || [];
      const grenadesList = (window.FLASHPOINT_DATA && window.FLASHPOINT_DATA.wargame && window.FLASHPOINT_DATA.wargame.grenades) || [];
      const itemsList = (window.FLASHPOINT_DATA && window.FLASHPOINT_DATA.wargame && window.FLASHPOINT_DATA.wargame.items) || [];

      const baseCost = parseInt(unit.cost, 10) || 0;
      let extraPoints = 0;
      let details = [];

      if (selMelee !== '__DEFAULT__') {
        const w = weaponsList.find(x => x.name === selMelee && (x.range || '').toUpperCase() === 'CC');
        if (w) { extraPoints += w.cost; details.push(`<span class="ui-icon icon-battle"></span> ${w.name}: Rango CC, AP ${w.ap}, Rasgos: ${w.traits}`); }
      }
      if (selPrimary !== '__DEFAULT__' && selPrimary !== '__NONE__') {
        const w = weaponsList.find(x => x.name === selPrimary && (x.range || '').toUpperCase() !== 'CC');
        if (w) { extraPoints += w.cost; details.push(`🔫 ${w.name}: Rango ${w.range}, AP ${w.ap}, Rasgos: ${w.traits}`); }
      }
      if (selSecondary !== '__DEFAULT__' && selSecondary !== '__NONE__') {
        const w = weaponsList.find(x => x.name === selSecondary);
        if (w) { extraPoints += w.cost; details.push(`🔫 ${w.name}: Rango ${w.range}, AP ${w.ap}, Rasgos: ${w.traits}`); }
      }
      if (selGrenade !== '__NONE__') {
        const g = grenadesList.find(x => x.name === selGrenade);
        if (g) { extraPoints += g.cost; details.push(`💣 ${g.name}: Rango ${g.range}, AP ${g.ap}, Rasgos: ${g.traits}`); }
      }
      if (selItem !== '__NONE__') {
        const i = itemsList.find(x => x.name === selItem);
        if (i) { extraPoints += i.cost; details.push(`🎒 ${i.name}: ${i.effect || i.traits || ''}`); }
      }

      const total = baseCost + extraPoints;
      document.getElementById('loadoutPointsTotal').textContent = `${total} PTS`;
      document.getElementById('loadoutPointsBreakdown').textContent = `Base: ${baseCost} PTS + Equipo Adicional: ${extraPoints} PTS`;
      document.getElementById('loadoutDetailsBox').innerHTML = details.length > 0 ? details.join('<br>') : 'Utilizando configuración base estándar.';
    };

    window.saveLoadout = function() {
      const activeSquad = squads.find(s => s.id === activeSquadId);
      if (!activeSquad || !activeLoadoutUnitUid) return;
      const unit = activeSquad.units.find(u => u.uniqueUid === activeLoadoutUnitUid);
      if (!unit) return;

      const selMelee = document.getElementById('selMeleeWeapon').value;
      const selPrimary = document.getElementById('selPrimaryWeapon').value;
      const selSecondary = document.getElementById('selSecondaryWeapon').value;
      const selGrenade = document.getElementById('selGrenade').value;
      const selItem = document.getElementById('selItem').value;

      const weaponsList = (window.FLASHPOINT_DATA && window.FLASHPOINT_DATA.wargame && window.FLASHPOINT_DATA.wargame.weapons) || [];
      const grenadesList = (window.FLASHPOINT_DATA && window.FLASHPOINT_DATA.wargame && window.FLASHPOINT_DATA.wargame.grenades) || [];
      const itemsList = (window.FLASHPOINT_DATA && window.FLASHPOINT_DATA.wargame && window.FLASHPOINT_DATA.wargame.items) || [];

      if (!unit.baseWeapons) unit.baseWeapons = JSON.parse(JSON.stringify(unit.weapons || []));

      const baseWeapons = unit.baseWeapons || [];
      const baseCC = baseWeapons.find(w => (w.range || '').toUpperCase() === 'CC') || baseWeapons[0];
      const baseRangedList = baseWeapons.filter(w => w !== baseCC);
      const baseRanged = baseRangedList[0] || null;
      const baseSecondary = baseRangedList[1] || null;

      let newWeapons = [];

      // 1. Melee
      if (selMelee === '__DEFAULT__') {
        if (baseCC) newWeapons.push(baseCC);
      } else {
        const w = weaponsList.find(x => x.name === selMelee && (x.range || '').toUpperCase() === 'CC');
        if (w) newWeapons.push(w);
      }

      // 2. Primary Ranged
      if (selPrimary === '__DEFAULT__') {
        if (baseRanged) newWeapons.push(baseRanged);
      } else if (selPrimary !== '__NONE__') {
        const w = weaponsList.find(x => x.name === selPrimary && (x.range || '').toUpperCase() !== 'CC');
        if (w) newWeapons.push(w);
      }

      // 3. Secondary
      if (selSecondary === '__DEFAULT__') {
        if (baseSecondary) newWeapons.push(baseSecondary);
      } else if (selSecondary !== '__NONE__') {
        const w = weaponsList.find(x => x.name === selSecondary);
        if (w) newWeapons.push(w);
      }

      unit.customWeapons = newWeapons;

      if (selGrenade !== '__NONE__') {
        unit.customGrenade = grenadesList.find(x => x.name === selGrenade) || null;
      } else {
        unit.customGrenade = null;
      }

      if (selItem !== '__NONE__') {
        unit.customItem = itemsList.find(x => x.name === selItem) || null;
      } else {
        unit.customItem = null;
      }

      const baseCost = parseInt(unit.cost, 10) || 0;
      let extra = 0;
      if (selMelee !== '__DEFAULT__') {
        const w = weaponsList.find(x => x.name === selMelee && (x.range || '').toUpperCase() === 'CC');
        if (w) extra += w.cost;
      }
      if (selPrimary !== '__DEFAULT__' && selPrimary !== '__NONE__') {
        const w = weaponsList.find(x => x.name === selPrimary && (x.range || '').toUpperCase() !== 'CC');
        if (w) extra += w.cost;
      }
      if (selSecondary !== '__DEFAULT__' && selSecondary !== '__NONE__') {
        const w = weaponsList.find(x => x.name === selSecondary);
        if (w) extra += w.cost;
      }
      if (unit.customGrenade) extra += unit.customGrenade.cost;
      if (unit.customItem) extra += unit.customItem.cost;

      unit.totalCost = baseCost + extra;

      saveSquads();
      closeLoadoutModal();
      renderSquadList();
      renderDatacard(unit, 'SQUAD');
    };

    window.resetLoadoutToDefault = function() {
      const activeSquad = squads.find(s => s.id === activeSquadId);
      if (!activeSquad || !activeLoadoutUnitUid) return;
      const unit = activeSquad.units.find(u => u.uniqueUid === activeLoadoutUnitUid);
      if (!unit) return;

      if (unit.baseWeapons) unit.weapons = JSON.parse(JSON.stringify(unit.baseWeapons));
      delete unit.customWeapons;
      delete unit.customGrenade;
      delete unit.customItem;
      unit.totalCost = parseInt(unit.cost, 10) || 0;

      saveSquads();
      closeLoadoutModal();
      renderSquadList();
      renderDatacard(unit, 'SQUAD');
    };

    // MODAL ÓRDENES Y MEJORAS
    window.openOrdersModal = function() {
      const activeSquad = squads.find(s => s.id === activeSquadId);
      if (!activeSquad) return;
      if (!activeSquad.orders) activeSquad.orders = [];
      if (!activeSquad.upgrades) activeSquad.upgrades = [];

      const ordersList = (window.FLASHPOINT_DATA && window.FLASHPOINT_DATA.wargame && window.FLASHPOINT_DATA.wargame.orders) || [];
      const upgradesList = (window.FLASHPOINT_DATA && window.FLASHPOINT_DATA.wargame && window.FLASHPOINT_DATA.wargame.upgrades) || [];

      let dominantFaction = 'UNSC';
      if (activeSquad.units && activeSquad.units.length > 0) {
        const hasBanished = activeSquad.units.some(u => (u.faction || '').toLowerCase().includes('banished'));
        if (hasBanished) dominantFaction = 'Banished';
      }

      const ordContainer = document.getElementById('ordersListContainer');
      ordContainer.innerHTML = '';
      ordersList.forEach(ord => {
        const isChecked = activeSquad.orders.includes(ord.name);
        const card = document.createElement('div');
        card.className = `order-card-item ${isChecked ? 'selected' : ''}`;
        card.onclick = (e) => {
          if (e.target.tagName !== 'INPUT') {
            const chk = card.querySelector('input[type="checkbox"]');
            chk.checked = !chk.checked;
          }
          card.classList.toggle('selected', card.querySelector('input[type="checkbox"]').checked);
          updateOrdersLivePoints();
        };
        card.innerHTML = `
          <input type="checkbox" value="${ord.name}" data-cost="${ord.cost}" ${isChecked ? 'checked' : ''} style="margin-top:4px;">
          <div class="order-card-info">
            <div class="order-card-name">
              <span>${ord.name}</span>
              <span class="order-cost-badge">+${ord.cost} PTS</span>
            </div>
            <div class="order-card-timing"><strong>Facción:</strong> ${ord.faction} | <strong>Para:</strong> ${ord.unit} | <strong>Momento:</strong> ${ord.timing}</div>
            <div class="order-card-effect">${ord.effect}</div>
          </div>
        `;
        ordContainer.appendChild(card);
      });

      const upgContainer = document.getElementById('upgradesListContainer');
      upgContainer.innerHTML = '';
      upgradesList.forEach(upg => {
        const isChecked = activeSquad.upgrades.includes(upg.name);
        const card = document.createElement('div');
        card.className = `order-card-item ${isChecked ? 'selected' : ''}`;
        card.onclick = (e) => {
          if (e.target.tagName !== 'INPUT') {
            const chk = card.querySelector('input[type="checkbox"]');
            chk.checked = !chk.checked;
          }
          card.classList.toggle('selected', card.querySelector('input[type="checkbox"]').checked);
          updateOrdersLivePoints();
        };
        card.innerHTML = `
          <input type="checkbox" value="${upg.name}" data-cost="${upg.cost}" ${isChecked ? 'checked' : ''} style="margin-top:4px;">
          <div class="order-card-info">
            <div class="order-card-name">
              <span>${upg.name}</span>
              <span class="order-cost-badge">+${upg.cost} PTS</span>
            </div>
          </div>
        `;
        upgContainer.appendChild(card);
      });

      updateOrdersLivePoints();
      let om = document.getElementById('ordersModal');
      om.classList.add('active');
    };

    window.closeOrdersModal = function() {
      document.getElementById('ordersModal').classList.remove('active');
    };

    window.updateOrdersLivePoints = function() {
      let ordersCost = 0;
      let orderCount = 0;
      document.querySelectorAll('#ordersListContainer input[type="checkbox"]:checked').forEach(c => {
        ordersCost += parseFloat(c.getAttribute('data-cost')) || 0;
        orderCount++;
      });
      let upgradesCost = 0;
      let upgCount = 0;
      document.querySelectorAll('#upgradesListContainer input[type="checkbox"]:checked').forEach(c => {
        upgradesCost += parseFloat(c.getAttribute('data-cost')) || 0;
        upgCount++;
      });
      const total = ordersCost + upgradesCost;
      document.getElementById('ordersPointsTotal').textContent = `${total} PTS`;
      document.getElementById('ordersPointsBreakdown').textContent = `${orderCount} órdenes (${ordersCost}P) + ${upgCount} mejoras (${upgradesCost}P)`;
    };

    window.saveOrders = function() {
      const activeSquad = squads.find(s => s.id === activeSquadId);
      if (!activeSquad) return;
      let selOrders = [];
      document.querySelectorAll('#ordersListContainer input[type="checkbox"]:checked').forEach(c => {
        selOrders.push(c.value);
      });
      let selUpgrades = [];
      document.querySelectorAll('#upgradesListContainer input[type="checkbox"]:checked').forEach(c => {
        selUpgrades.push(c.value);
      });
      activeSquad.orders = selOrders;
      activeSquad.upgrades = selUpgrades;
      saveSquads();
      closeOrdersModal();
      renderSquadList();
    };

    // ==============================================================
    // SIMULADOR DE ENFRENTAMIENTOS D8 (HALO: FLASHPOINT)
    // ==============================================================
    let diceCombatState = {
      attCount: 4,
      attTarget: 4,
      attHeadshotThreshold: 8,
      defCount: 3,
      defTarget: 5,
      attDice: [],
      defDice: [],
      isRolling: false,
      extraHeadshotsEarned: 0
    };

    window.openDiceModal = function() {
      const modal = document.getElementById('diceModal');
      if (modal) {
        modal.classList.add('active');
        updateDiceControlsUI();
        updateGameTrackerUI();
        renderCommandDiceGrid('p1');
        renderCommandDiceGrid('p2');
      }
    };

    window.closeDiceModal = function() {
  const modal = document.getElementById('diceModal');
  if (modal) modal.classList.remove('active');
  if (document.body.classList.contains('spa-mode')) window.goHome();
};

    const diceModalOverlay = document.getElementById('diceModal');
    if (diceModalOverlay) {
      diceModalOverlay.addEventListener('click', (e) => {
        if (e.target === diceModalOverlay) closeDiceModal();
      });
    }

    window.changeAttDiceCount = function(delta) {
      diceCombatState.attCount = Math.max(1, Math.min(12, diceCombatState.attCount + delta));
      const el = document.getElementById('dispAttCount');
      if (el) el.textContent = diceCombatState.attCount;
    };

    window.changeDefDiceCount = function(delta) {
      diceCombatState.defCount = Math.max(1, Math.min(12, diceCombatState.defCount + delta));
      const el = document.getElementById('dispDefCount');
      if (el) el.textContent = diceCombatState.defCount;
    };

    window.setAttTarget = function(val) {
      diceCombatState.attTarget = parseInt(val, 10) || 4;
      [3, 4, 5, 6].forEach(v => {
        const btn = document.getElementById('btnAttDiff' + v);
        if (btn) btn.classList.toggle('active', v === diceCombatState.attTarget);
      });
    };

    window.setDefTarget = function(val) {
      diceCombatState.defTarget = parseInt(val, 10) || 5;
      [3, 4, 5, 6].forEach(v => {
        const btn = document.getElementById('btnDefDiff' + v);
        if (btn) btn.classList.toggle('active', v === diceCombatState.defTarget);
      });
    };

    window.toggleHeadshotThreshold = function() {
      diceCombatState.attHeadshotThreshold = (diceCombatState.attHeadshotThreshold === 7) ? 8 : 7;
      const btn = document.getElementById('btnHeadshot7Toggle');
      if (btn) btn.classList.toggle('active', diceCombatState.attHeadshotThreshold === 7);
    };

    function updateDiceControlsUI() {
      const dispAtt = document.getElementById('dispAttCount');
      if (dispAtt) dispAtt.textContent = diceCombatState.attCount;
      const dispDef = document.getElementById('dispDefCount');
      if (dispDef) dispDef.textContent = diceCombatState.defCount;
      setAttTarget(diceCombatState.attTarget);
      setDefTarget(diceCombatState.defTarget);
      const btn = document.getElementById('btnHeadshot7Toggle');
      if (btn) btn.classList.toggle('active', diceCombatState.attHeadshotThreshold === 7);
    }

    function rollD8() {
      return Math.floor(Math.random() * 8) + 1;
    }

    window.rollDiceCombat = function() {
      if (diceCombatState.isRolling) return;
      diceCombatState.isRolling = true;

      const attGrid = document.getElementById('attackerDiceGrid');
      const defGrid = document.getElementById('defenderDiceGrid');
      const btnRoll = document.getElementById('btnRollDiceCombat');
      const btnExtra = document.getElementById('btnRollExtraHeadshots');
      const btnReroll = document.getElementById('btnRerollAttFails');
      const verdict = document.getElementById('diceCombatMainVerdict');

      if (btnExtra) btnExtra.style.display = 'none';
      if (btnReroll) btnReroll.style.display = 'none';
      if (btnRoll) btnRoll.disabled = true;
      if (verdict) {
        verdict.className = 'dice-scoreboard-badge idle';
        verdict.textContent = 'RODANDO DADOS...';
      }

      function renderRolling(phaseClass) {
        if (attGrid) {
          attGrid.innerHTML = Array.from({ length: diceCombatState.attCount }).map(() => `
            <div class="d8-die white ${phaseClass}">
              <span class="d8-die-val">${rollD8()}</span>
            </div>
          `).join('');
        }
        if (defGrid) {
          defGrid.innerHTML = Array.from({ length: diceCombatState.defCount }).map(() => `
            <div class="d8-die black ${phaseClass}">
              <span class="d8-die-val">${rollD8()}</span>
            </div>
          `).join('');
        }
      }

      // Animación de 1.5 segundos (1500ms) con desaceleración progresiva de giro y números aleatorios en suspenso
      const frames = [
        // Fase 1: Rodaje rápido (12 frames x 50ms = 600ms)
        ...Array(12).fill({ delay: 50, phase: 'rolling-fast' }),
        // Fase 2: Desaceleración media (6 frames x 90ms = 540ms)
        ...Array(6).fill({ delay: 90, phase: 'rolling-med' }),
        // Fase 3: Suspenso final con oscilación sutil (2 frames x 180ms = 360ms)
        ...Array(2).fill({ delay: 180, phase: 'rolling-slow' })
      ];

      let frameIdx = 0;
      function stepFrame() {
        const current = frames[frameIdx];
        renderRolling(current.phase);
        frameIdx++;
        if (frameIdx < frames.length) {
          setTimeout(stepFrame, current.delay);
        } else {
          setTimeout(finalizeDiceCombat, current.delay);
        }
      }

      stepFrame();
    };

    function finalizeDiceCombat() {
      const btnRoll = document.getElementById('btnRollDiceCombat');
      const btnExtra = document.getElementById('btnRollExtraHeadshots');
      const btnReroll = document.getElementById('btnRerollAttFails');
      const spanExtraCount = document.getElementById('extraHeadshotCount');

      diceCombatState.attDice = [];
      diceCombatState.defDice = [];
      diceCombatState.extraHeadshotsEarned = 0;

      let attSuccessCount = 0;
      let attHeadshotCount = 0;
      let attFailCount = 0;

      for (let i = 0; i < diceCombatState.attCount; i++) {
        const val = rollD8();
        let status = 'fail';
        if (val >= diceCombatState.attHeadshotThreshold) {
          status = 'headshot';
          attSuccessCount++;
          attHeadshotCount++;
        } else if (val >= diceCombatState.attTarget) {
          status = 'success';
          attSuccessCount++;
        } else {
          attFailCount++;
        }
        diceCombatState.attDice.push({ val, status });
      }

      let defSuccessCount = 0;

      for (let i = 0; i < diceCombatState.defCount; i++) {
        const val = rollD8();
        let status = 'fail';
        if (val >= diceCombatState.defTarget) {
          status = 'success';
          defSuccessCount++;
        }
        diceCombatState.defDice.push({ val, status });
      }

      diceCombatState.extraHeadshotsEarned = attHeadshotCount;

      renderDiceCombatGrids();
      updateCombatVerdict(attSuccessCount, defSuccessCount, attHeadshotCount);

      if (btnRoll) btnRoll.disabled = false;
      diceCombatState.isRolling = false;

      // Botón para dados extra por headshot
      if (attHeadshotCount > 0 && btnExtra) {
        if (spanExtraCount) spanExtraCount.textContent = attHeadshotCount;
        btnExtra.style.display = 'inline-flex';
      }

      // Botón para repetir fallos del atacante
      if (attFailCount > 0 && btnReroll) {
        btnReroll.style.display = 'inline-flex';
      }
    }

    function renderDiceCombatGrids() {
      const attGrid = document.getElementById('attackerDiceGrid');
      const defGrid = document.getElementById('defenderDiceGrid');

      if (attGrid) {
        attGrid.innerHTML = diceCombatState.attDice.map(d => {
          let badgeText = '❌';
          if (d.status === 'headshot') badgeText = '<span class="ui-icon icon-crit"></span>+1';
          else if (d.status === 'success') badgeText = '✔';
          return `
            <div class="d8-die white ${d.status}">
              <span class="d8-die-val">${d.val}</span>
              <span class="d8-die-badge">${badgeText}</span>
            </div>
          `;
        }).join('');
      }

      if (defGrid) {
        defGrid.innerHTML = diceCombatState.defDice.map(d => {
          let badgeText = d.status === 'success' ? '✔' : '❌';
          return `
            <div class="d8-die black ${d.status}">
              <span class="d8-die-val">${d.val}</span>
              <span class="d8-die-badge">${badgeText}</span>
            </div>
          `;
        }).join('');
      }
    }

    function updateCombatVerdict(attSuccesses, defSuccesses, headshots) {
      const dispAtt = document.getElementById('dispAttSuccesses');
      const dispDef = document.getElementById('dispDefSuccesses');
      const verdict = document.getElementById('diceCombatMainVerdict');
      const breakdown = document.getElementById('diceCombatBreakdown');

      if (dispAtt) dispAtt.textContent = attSuccesses;
      if (dispDef) dispDef.textContent = defSuccesses;
      if (!verdict) return;

      const netHits = attSuccesses - defSuccesses;

      if (netHits > 0) {
        verdict.className = 'dice-scoreboard-badge hit';
        verdict.innerHTML = `<span class="ui-icon icon-crit"></span> +${netHits} IMPACTO${netHits > 1 ? 'S' : ''}`;
      } else if (netHits === 0) {
        verdict.className = 'dice-scoreboard-badge tied';
        verdict.innerHTML = '<span class="ui-icon icon-shield"></span> BLOQUEADO (EMPATE)';
      } else {
        verdict.className = 'dice-scoreboard-badge fail';
        verdict.innerHTML = '<span class="ui-icon icon-shield"></span> SIN IMPACTOS';
      }

      if (breakdown) {
        let note = headshots > 0 ? `Incluye ${headshots} Crítico${headshots > 1 ? 's' : ''} (Headshot). ` : '';
        breakdown.textContent = `${note}Aplica AP, Escudos y Armadura en mesa según corresponda.`;
      }
    }

    window.rollExtraHeadshotDice = function() {
      const extraCount = diceCombatState.extraHeadshotsEarned;
      if (extraCount <= 0) return;

      const btnExtra = document.getElementById('btnRollExtraHeadshots');
      if (btnExtra) btnExtra.style.display = 'none';

      let newHeadshots = 0;
      for (let i = 0; i < extraCount; i++) {
        const val = rollD8();
        let status = 'fail';
        if (val >= diceCombatState.attHeadshotThreshold) {
          status = 'headshot';
          newHeadshots++;
        } else if (val >= diceCombatState.attTarget) {
          status = 'success';
        }
        diceCombatState.attDice.push({ val, status });
      }

      renderDiceCombatGrids();

      const attSuccesses = diceCombatState.attDice.filter(d => d.status !== 'fail').length;
      const defSuccesses = diceCombatState.defDice.filter(d => d.status === 'success').length;
      const totalHeadshots = diceCombatState.attDice.filter(d => d.status === 'headshot').length;

      updateCombatVerdict(attSuccesses, defSuccesses, totalHeadshots);

      if (newHeadshots > 0 && btnExtra) {
        diceCombatState.extraHeadshotsEarned = newHeadshots;
        const spanExtraCount = document.getElementById('extraHeadshotCount');
        if (spanExtraCount) spanExtraCount.textContent = newHeadshots;
        btnExtra.style.display = 'inline-flex';
      }
    };

    window.rerollFailedAttackerDice = function() {
      const failedIndices = [];
      diceCombatState.attDice.forEach((d, idx) => {
        if (d.status === 'fail') failedIndices.push(idx);
      });

      if (failedIndices.length === 0) return;

      const btnReroll = document.getElementById('btnRerollAttFails');
      if (btnReroll) btnReroll.style.display = 'none';

      let newHeadshots = 0;
      failedIndices.forEach(idx => {
        const val = rollD8();
        let status = 'fail';
        if (val >= diceCombatState.attHeadshotThreshold) {
          status = 'headshot';
          newHeadshots++;
        } else if (val >= diceCombatState.attTarget) {
          status = 'success';
        }
        diceCombatState.attDice[idx] = { val, status };
      });

      renderDiceCombatGrids();

      const attSuccesses = diceCombatState.attDice.filter(d => d.status !== 'fail').length;
      const defSuccesses = diceCombatState.defDice.filter(d => d.status === 'success').length;
      const totalHeadshots = diceCombatState.attDice.filter(d => d.status === 'headshot').length;

      updateCombatVerdict(attSuccesses, defSuccesses, totalHeadshots);

      if (newHeadshots > 0) {
        const btnExtra = document.getElementById('btnRollExtraHeadshots');
        if (btnExtra) {
          diceCombatState.extraHeadshotsEarned += newHeadshots;
          const spanExtraCount = document.getElementById('extraHeadshotCount');
          if (spanExtraCount) spanExtraCount.textContent = diceCombatState.extraHeadshotsEarned;
          btnExtra.style.display = 'inline-flex';
        }
      }
    };

    window.resetDiceCombat = function() {
      diceCombatState.attDice = [];
      diceCombatState.defDice = [];
      diceCombatState.extraHeadshotsEarned = 0;

      const attGrid = document.getElementById('attackerDiceGrid');
      const defGrid = document.getElementById('defenderDiceGrid');
      const dispAtt = document.getElementById('dispAttSuccesses');
      const dispDef = document.getElementById('dispDefSuccesses');
      const verdict = document.getElementById('diceCombatMainVerdict');
      const breakdown = document.getElementById('diceCombatBreakdown');
      const btnExtra = document.getElementById('btnRollExtraHeadshots');
      const btnReroll = document.getElementById('btnRerollAttFails');

      if (attGrid) attGrid.innerHTML = '<span style="color:#64748b; font-size:0.8rem; font-family:\'Share Tech Mono\';">Dados Atacante</span>';
      if (defGrid) defGrid.innerHTML = '<span style="color:#64748b; font-size:0.8rem; font-family:\'Share Tech Mono\';">Dados Defensor</span>';
      if (dispAtt) dispAtt.textContent = '-';
      if (dispDef) dispDef.textContent = '-';
      if (verdict) {
        verdict.className = 'dice-scoreboard-badge idle';
        verdict.textContent = 'LISTO PARA TIRAR';
      }
      if (breakdown) breakdown.textContent = 'Aplica AP, Escudos y Armadura en mesa según corresponda.';
      if (btnExtra) btnExtra.style.display = 'none';
      if (btnReroll) btnReroll.style.display = 'none';
    };

    // ==============================================================
    // PESTAÑAS DEL CENTRO TÁCTICO DE DADOS
    // ==============================================================
    window.switchDiceTab = function(tabName) {
      const tabs = ['combat', 'command', 'scatter', 'recon'];
      tabs.forEach(t => {
        const btn = document.getElementById('tabBtnDice' + t.charAt(0).toUpperCase() + t.slice(1));
        const panel = document.getElementById('dicePanel' + t.charAt(0).toUpperCase() + t.slice(1));
        if (btn) btn.classList.toggle('active', t === tabName);
        if (panel) panel.classList.toggle('active', t === tabName);
      });
    };

    // ==============================================================
    // CONTROL DE PARTIDA (RONDAS Y PUNTOS DE VICTORIA VP)
    // ==============================================================
    let gameTrackerState = {
      round: 1,
      p1Score: 0,
      p2Score: 0,
      p1Name: 'J1',
      p2Name: 'J2'
    };

    window.editPlayerName = function(player) {
      const current = player === 'p1' ? gameTrackerState.p1Name : gameTrackerState.p2Name;
      const playerLabel = player === 'p1' ? 'Jugador 1 (Rojo)' : 'Jugador 2 (Azul)';
      const msg = `Introduce el nombre para ${playerLabel}:\n(Máximo 12 caracteres)`;
      const res = prompt(msg, current);
      if (res !== null && res.trim() !== '') {
        const clean = res.trim().slice(0, 12);
        if (player === 'p1') gameTrackerState.p1Name = clean;
        else gameTrackerState.p2Name = clean;
        updatePlayerNamesUI();
      }
    };

    function updatePlayerNamesUI() {
      const p1Label = document.getElementById('gameTrackerP1Label');
      const p2Label = document.getElementById('gameTrackerP2Label');
      const cmdP1 = document.getElementById('cmdDiceP1Name');
      const cmdP2 = document.getElementById('cmdDiceP2Name');
      const reconP1 = document.getElementById('reconInitP1Name');
      const reconP2 = document.getElementById('reconInitP2Name');

      if (p1Label) p1Label.innerHTML = `<span class="ui-icon icon-p1"></span> ${gameTrackerState.p1Name}:`;
      if (p2Label) p2Label.innerHTML = `<span class="ui-icon icon-p2"></span> ${gameTrackerState.p2Name}:`;
      if (cmdP1) cmdP1.innerHTML = `<span class="ui-icon icon-p1"></span> ${gameTrackerState.p1Name.toUpperCase()}`;
      if (cmdP2) cmdP2.innerHTML = `<span class="ui-icon icon-p2"></span> ${gameTrackerState.p2Name.toUpperCase()}`;
      if (reconP1) reconP1.innerHTML = `<span class="ui-icon icon-p1"></span> ${gameTrackerState.p1Name.toUpperCase()}`;
      if (reconP2) reconP2.innerHTML = `<span class="ui-icon icon-p2"></span> ${gameTrackerState.p2Name.toUpperCase()}`;

      if (typeof reconState !== 'undefined' && reconState.hasInitiativeWinner) {
        reconState.winnerName = reconState.winnerPlayer === 'p1' ? gameTrackerState.p1Name : gameTrackerState.p2Name;
        reconState.loserName = reconState.winnerPlayer === 'p1' ? gameTrackerState.p2Name : gameTrackerState.p1Name;
        const titleWin = document.getElementById('reconWinTitle');
        const titleLose = document.getElementById('reconLoseTitle');
        if (titleWin) titleWin.innerHTML = `<span class="ui-icon icon-winner"></span> EFECTO GANADOR (${reconState.winnerName})`;
        if (titleLose) titleLose.innerHTML = `<span class="ui-icon icon-shield"></span> EFECTO PERDEDOR (${reconState.loserName})`;
      }
    }

    window.stepGameRound = function(delta) {
      gameTrackerState.round = Math.max(1, Math.min(10, gameTrackerState.round + delta));
      updateGameTrackerUI();
    };

    window.nextGameRound = function() {
      gameTrackerState.round = Math.min(10, gameTrackerState.round + 1);
      updateGameTrackerUI();
      resetCommandDiceForNewRound();
    };

    window.stepGameScore = function(player, delta) {
      if (player === 'p1') {
        gameTrackerState.p1Score = Math.max(0, gameTrackerState.p1Score + delta);
      } else {
        gameTrackerState.p2Score = Math.max(0, gameTrackerState.p2Score + delta);
      }
      updateGameTrackerUI();
    };

    window.resetGameTracker = function() {
      if (confirm('¿Reiniciar partida a Ronda 1, 0-0 VP y restablecer tiradas?')) {
        gameTrackerState.round = 1;
        gameTrackerState.p1Score = 0;
        gameTrackerState.p2Score = 0;
        updateGameTrackerUI();
        resetCommandDiceForNewRound();
        if (window.resetReconState) window.resetReconState();
      }
    };

    function updateGameTrackerUI() {
      const rEl = document.getElementById('gameTrackerRound');
      const p1El = document.getElementById('gameTrackerP1Score');
      const p2El = document.getElementById('gameTrackerP2Score');
      if (rEl) rEl.textContent = gameTrackerState.round;
      if (p1El) p1El.textContent = gameTrackerState.p1Score;
      if (p2El) p2El.textContent = gameTrackerState.p2Score;
      updatePlayerNamesUI();
    }

    // ==============================================================
    // DADOS DE MANDO (COMMAND DICE - REGLAS OFICIALES HALO: FLASHPOINT)
    // ==============================================================
    const COMMAND_DICE_FACES = [
      {
        id: 'model',
        name: '+1 MODEL',
        color: '#38bdf8',
        icon: '<span class="cmd-icon icon-cmd-model" style="display:block;width:32px;height:32px;margin:0 auto;background-size:contain;background-repeat:no-repeat;background-position:center;background-image:url(icons/icon-cmd-model.svg);"></span>',
        desc: "Activa un 2º modelo consecutivo o roba la iniciativa en la fase final."
      },
      {
        id: 'dice',
        name: 'DICE',
        color: '#a855f7',
        icon: '<span class="cmd-icon icon-cmd-dice" style="display:block;width:32px;height:32px;margin:0 auto;background-size:contain;background-repeat:no-repeat;background-position:center;background-image:url(icons/icon-cmd-dice.svg);"></span>',
        desc: "+1 dado para cualquier test de Disparo, Asalto o Supervivencia."
      },
      {
        id: 'advance',
        name: 'ADVANCE',
        color: '#22c55e',
        icon: '<span class="cmd-icon icon-cmd-advance" style="display:block;width:32px;height:32px;margin:0 auto;background-size:contain;background-repeat:no-repeat;background-position:center;background-image:url(icons/icon-cmd-advance.svg);"></span>',
        desc: "Acción gratuita de avance (1 cubo) sin contar para el límite de acciones."
      },
      {
        id: 'shoot',
        name: 'SHOOT',
        color: '#f97316',
        icon: '<span class="cmd-icon icon-cmd-shoot" style="display:block;width:32px;height:32px;margin:0 auto;background-size:contain;background-repeat:no-repeat;background-position:center;background-image:url(icons/icon-cmd-shoot.svg);"></span>',
        desc: "Acción gratuita de Disparo."
      },
      {
        id: 'assault',
        name: 'ASSAULT',
        color: '#ef4444',
        icon: '<span class="cmd-icon icon-cmd-assault" style="display:block;width:32px;height:32px;margin:0 auto;background-size:contain;background-repeat:no-repeat;background-position:center;background-image:url(icons/icon-cmd-assault.svg);"></span>',
        desc: "Acción gratuita de Asalto."
      },
      {
        id: 'special',
        name: 'SPECIAL',
        color: '#eab308',
        icon: '<span class="cmd-icon icon-cmd-special" style="display:block;width:32px;height:32px;margin:0 auto;background-size:contain;background-repeat:no-repeat;background-position:center;background-image:url(icons/icon-cmd-special.svg);"></span>',
        desc: "Activa la orden especial de tu escuadra."
      }
    ];

    let commandDiceState = {
      p1Count: 2,
      p2Count: 2,
      p1Dice: [],
      p2Dice: []
    };

    function rollRandomCmdFace() {
      return Math.floor(Math.random() * COMMAND_DICE_FACES.length);
    }

    window.changeCmdCount = function(player, delta) {
      if (player === 'p1') {
        commandDiceState.p1Count = Math.max(1, Math.min(6, commandDiceState.p1Count + delta));
        const el = document.getElementById('dispCmdCountP1');
        if (el) el.textContent = commandDiceState.p1Count;
      } else {
        commandDiceState.p2Count = Math.max(1, Math.min(6, commandDiceState.p2Count + delta));
        const el = document.getElementById('dispCmdCountP2');
        if (el) el.textContent = commandDiceState.p2Count;
      }
    };

    window.rollCommandDice = function(player) {
      const count = player === 'p1' ? commandDiceState.p1Count : commandDiceState.p2Count;
      const grid = document.getElementById(player === 'p1' ? 'cmdDiceGridP1' : 'cmdDiceGridP2');
      const btnRoll = document.getElementById(player === 'p1' ? 'btnRollCmdP1' : 'btnRollCmdP2');

      if (btnRoll) btnRoll.disabled = true;

      const frames = [
        ...Array(10).fill(50),
        ...Array(5).fill(90),
        ...Array(2).fill(170)
      ];

      let fIdx = 0;
      function step() {
        if (grid) {
          grid.innerHTML = Array.from({ length: count }).map(() => {
            const f = COMMAND_DICE_FACES[rollRandomCmdFace()];
            return `
              <div class="cmd-die rolling" style="border-color:${f.color}; color:${f.color};">
                <div class="cmd-die-icon">${f.icon}</div>
                <div class="cmd-die-title">${f.name}</div>
              </div>
            `;
          }).join('');
        }
        fIdx++;
        if (fIdx < frames.length) {
          setTimeout(step, frames[fIdx]);
        } else {
          finalizeCommandDice(player, count);
          if (btnRoll) btnRoll.disabled = false;
        }
      }
      step();
    };

    function finalizeCommandDice(player, count) {
      const newDice = Array.from({ length: count }).map(() => ({
        faceIdx: rollRandomCmdFace(),
        spent: false
      }));
      if (player === 'p1') commandDiceState.p1Dice = newDice;
      else commandDiceState.p2Dice = newDice;
      renderCommandDiceGrid(player);
    }

    window.toggleSpentCmdDie = function(player, idx) {
      const dice = player === 'p1' ? commandDiceState.p1Dice : commandDiceState.p2Dice;
      if (dice[idx]) {
        dice[idx].spent = !dice[idx].spent;
        renderCommandDiceGrid(player);
      }
    };

    function renderCommandDiceGrid(player) {
      const grid = document.getElementById(player === 'p1' ? 'cmdDiceGridP1' : 'cmdDiceGridP2');
      const dice = player === 'p1' ? commandDiceState.p1Dice : commandDiceState.p2Dice;
      if (!grid) return;

      if (dice.length === 0) {
        grid.innerHTML = '<span style="color:#64748b; font-size:0.75rem; font-family:\'Share Tech Mono\';">Sin dados tirados</span>';
        return;
      }

      grid.innerHTML = dice.map((d, i) => {
        const f = COMMAND_DICE_FACES[d.faceIdx];
        return `
          <div class="cmd-die ${d.spent ? 'spent' : ''}" style="border-color:${f.color}; color:${f.color};" onclick="toggleSpentCmdDie('${player}', ${i})" title="${f.desc} (Clic para marcar como gastado)">
            <div class="cmd-die-icon">${f.icon}</div>
            <div class="cmd-die-title">${f.name}</div>
          </div>
        `;
      }).join('');
    }

    window.rerollUnspentCommandDice = function(player) {
      const dice = player === 'p1' ? commandDiceState.p1Dice : commandDiceState.p2Dice;
      if (!dice || dice.length === 0) return;
      const grid = document.getElementById(player === 'p1' ? 'cmdDiceGridP1' : 'cmdDiceGridP2');
      if (!grid) return;

      const frames = [
        ...Array(10).fill(50),
        ...Array(5).fill(90),
        ...Array(2).fill(170)
      ];

      let fIdx = 0;
      function step() {
        grid.innerHTML = dice.map((d, i) => {
          if (d.spent) {
            const f = COMMAND_DICE_FACES[d.faceIdx];
            return `
              <div class="cmd-die spent" style="border-color:${f.color}; color:${f.color};">
                <div class="cmd-die-icon">${f.icon}</div>
                <div class="cmd-die-title">${f.name}</div>
              </div>
            `;
          } else {
            const f = COMMAND_DICE_FACES[rollRandomCmdFace()];
            return `
              <div class="cmd-die rolling" style="border-color:${f.color}; color:${f.color};">
                <div class="cmd-die-icon">${f.icon}</div>
                <div class="cmd-die-title">${f.name}</div>
              </div>
            `;
          }
        }).join('');
        
        fIdx++;
        if (fIdx < frames.length) {
          setTimeout(step, frames[fIdx]);
        } else {
          dice.forEach(d => {
            if (!d.spent) d.faceIdx = rollRandomCmdFace();
          });
          renderCommandDiceGrid(player);
        }
      }
      step();
    };

    window.rollBothCommandDice = function() {
      rollCommandDice('p1');
      rollCommandDice('p2');
    };

    function resetCommandDiceForNewRound() {
      commandDiceState.p1Dice = [];
      commandDiceState.p2Dice = [];
      renderCommandDiceGrid('p1');
      renderCommandDiceGrid('p2');
    }

    // ==============================================================
    // DISPERSIÓN Y EMPUJE 3X3 (HALO: FLASHPOINT)
    // ==============================================================
    const SCATTER_DIRS = {
      1: { name: "DIAGONAL SUPERIOR IZQUIERDA (1)", desc: "Desvío / Empuje hacia el cubo Noroeste." },
      2: { name: "2: NORTE (FRENTE / SUPERIOR)", desc: "Desvío / Empuje hacia el cubo Norte directo." },
      3: { name: "3: NORESTE (DIAGONAL ARRIBA DER.)", desc: "Desvío / Empuje hacia el cubo Noreste." },
      4: { name: "4: ESTE (LATERAL DERECHO)", desc: "Desvío / Empuje hacia el cubo Este directo." },
      5: { name: "5: SURESTE (DIAGONAL ABAJO DER.)", desc: "Desvío / Empuje hacia el cubo Sureste." },
      6: { name: "6: SUR (ATRÁS / INFERIOR)", desc: "Desvío / Empuje hacia el cubo Sur directo." },
      7: { name: "7: SUROESTE (DIAGONAL ABAJO IZQ.)", desc: "Desvío / Empuje hacia el cubo Suroeste." },
      8: { name: "8: OESTE (LATERAL IZQUIERDO)", desc: "Desvío / Empuje hacia el cubo Oeste directo." }
    };

    window.rollScatterD8 = function() {
      const btn = document.getElementById('btnRollScatter');
      const verdictTitle = document.getElementById('scatterVerdictTitle');

      if (btn) btn.disabled = true;
      if (verdictTitle) {
        verdictTitle.className = 'dice-scoreboard-badge idle';
        verdictTitle.textContent = 'GIRANDO RULETA...';
      }

      for (let i = 1; i <= 8; i++) {
        const cell = document.getElementById('scatterCell' + i);
        if (cell) cell.classList.remove('active');
      }

      const finalTarget = Math.floor(Math.random() * 8) + 1;
      const totalSteps = 16 + finalTarget;

      const stepDelays = [];
      for (let s = 0; s < totalSteps; s++) {
        const remaining = totalSteps - s;
        if (remaining > 10) stepDelays.push(35);
        else if (remaining > 6) stepDelays.push(60);
        else if (remaining === 6) stepDelays.push(90);
        else if (remaining === 5) stepDelays.push(120);
        else if (remaining === 4) stepDelays.push(160);
        else if (remaining === 3) stepDelays.push(210);
        else if (remaining === 2) stepDelays.push(270);
        else stepDelays.push(350);
      }

      let currentStep = 0;
      let currentNum = 1;

      function spinRoulette() {
        for (let i = 1; i <= 8; i++) {
          const cell = document.getElementById('scatterCell' + i);
          if (cell) cell.classList.remove('active');
        }

        const activeCell = document.getElementById('scatterCell' + currentNum);
        if (activeCell) activeCell.classList.add('active');

        currentStep++;
        if (currentStep < totalSteps) {
          currentNum = (currentNum % 8) + 1;
          setTimeout(spinRoulette, stepDelays[currentStep]);
        } else {
          const dirInfo = SCATTER_DIRS[finalTarget];
          if (verdictTitle) {
            verdictTitle.className = 'dice-scoreboard-badge hit';
            verdictTitle.innerHTML = `<span class="ui-icon icon-recon"></span> ${dirInfo.name}`;
          }
          if (btn) btn.disabled = false;
        }
      }

      spinRoulette();
    };

    // ==============================================================
    // RECON (EXPLORACIÓN) Y CHEQUEOS SIMPLES
    // ==============================================================
    const RECON_WINNER_EFFECTS = {
      1: "Mira 3 fichas de objeto en secreto y regrésalas boca abajo al cubo de donde salieron.",
      2: "Selecciona al azar 1 ficha de arma de la pila boca abajo, mírala y colócala en un cubo de despliegue de armas (Weapon Drop) de tu elección.",
      3: "Coloca 1 ficha de objeto adicional boca abajo en un cubo de tu elección (no en ninguna zona de despliegue).",
      4: "Otorga a uno de tus modelos un objeto de Granada de Fragmentación.",
      5: "2 modelos aliados pueden realizar una acción de AVANCE de 1 cubo cada uno (no los marques como activados y no pueden entrar a cubos con enemigos).",
      6: "Elige 1 cubo. Todos los modelos en ese cubo quedan Inmovilizados (Pinned).",
      7: "2 modelos aliados pueden realizar una acción de AGACHARSE (Crouch) sin marcarse como activados.",
      8: "Elige 1 cubo. Dicho cubo gana el efecto Barrera de Escudo de Energía (2) durante la Ronda 1 (no puede moverse)."
    };

    const RECON_LOSER_EFFECTS = {
      1: "Mira 1 ficha de objeto en secreto y regrésala boca abajo al cubo de donde salió.",
      2: "Mira 1 ficha de objeto en secreto y regrésala boca abajo al cubo de donde salió.",
      3: "1 modelo aliado puede realizar una acción de AVANCE de 1 cubo (no se marca como activado ni entra a cubos ocupados por enemigos).",
      4: "1 modelo aliado puede realizar una acción de AVANCE de 1 cubo (no se marca como activado ni entra a cubos ocupados por enemigos).",
      5: "1 modelo aliado puede realizar una acción de AGACHARSE (Crouch) sin marcarse como activado.",
      6: "1 modelo aliado puede realizar una acción de AGACHARSE (Crouch) sin marcarse como activado.",
      7: "Otorga a uno de tus modelos un objeto de Munición Explosiva.",
      8: "Otorga a uno de tus modelos un objeto de Munición Explosiva."
    };

    let reconState = {
      hasInitiativeWinner: false,
      winnerPlayer: null,
      winnerName: '',
      loserName: '',
      winnerDiff: 1,
      winnerRolled: false,
      loserRolled: false
    };

    window.resetReconState = function() {
      reconState.hasInitiativeWinner = false;
      reconState.winnerPlayer = null;
      reconState.winnerName = '';
      reconState.loserName = '';
      reconState.winnerDiff = 1;
      reconState.winnerRolled = false;
      reconState.loserRolled = false;

      const btnWin = document.getElementById('btnRollReconWin');
      const btnLose = document.getElementById('btnRollReconLose');
      const titleWin = document.getElementById('reconWinTitle');
      const titleLose = document.getElementById('reconLoseTitle');
      const textWin = document.getElementById('reconWinText');
      const textLose = document.getElementById('reconLoseText');
      const dieWin = document.getElementById('reconWinDieContainer');
      const dieLose = document.getElementById('reconLoseDieContainer');
      const verdict = document.getElementById('reconInitVerdict');
      const scoreP1 = document.getElementById('reconInitP1Score');
      const scoreP2 = document.getElementById('reconInitP2Score');
      const p1Dice = document.getElementById('reconInitP1Dice');
      const p2Dice = document.getElementById('reconInitP2Dice');

      if (titleWin) titleWin.innerHTML = '<span class="ui-icon icon-winner"></span> EFECTO GANADOR';
      if (titleLose) titleLose.innerHTML = '<span class="ui-icon icon-shield"></span> EFECTO PERDEDOR';

      if (btnWin) {
        btnWin.disabled = true;
        btnWin.style.opacity = '0.4';
        btnWin.style.cursor = 'not-allowed';
        btnWin.innerHTML = '<span class="ui-icon icon-dice"></span> TIRAR D8';
      }
      if (btnLose) {
        btnLose.disabled = true;
        btnLose.style.opacity = '0.4';
        btnLose.style.cursor = 'not-allowed';
        btnLose.innerHTML = '<span class="ui-icon icon-dice"></span> TIRAR D8';
      }
      if (textWin) {
        textWin.textContent = 'Bloqueado hasta definir la iniciativa.';
        textWin.style.color = '#94a3b8';
      }
      if (textLose) {
        textLose.textContent = 'Bloqueado hasta definir la iniciativa.';
        textLose.style.color = '#94a3b8';
      }
      if (dieWin) {
        dieWin.innerHTML = '<div class="d8-die white" style="opacity:0.45;"><span class="d8-die-val">-</span></div>';
      }
      if (dieLose) {
        dieLose.innerHTML = '<div class="d8-die black" style="opacity:0.45;"><span class="d8-die-val">-</span></div>';
      }
      if (verdict) {
        verdict.className = 'dice-scoreboard-badge idle';
        verdict.textContent = 'TIRA EL TEST DE RECON (5 DADOS A 5+) PARA DEFINIR GANADOR Y PERDEDOR';
      }
      if (scoreP1) scoreP1.textContent = '(- Éxitos)';
      if (scoreP2) scoreP2.textContent = '(- Éxitos)';
      if (p1Dice) {
        p1Dice.innerHTML = Array(5).fill('<div class="d8-die white" style="opacity:0.45; width:44px; height:50px;"><span class="d8-die-val" style="font-size:1.3rem;">-</span></div>').join('');
      }
      if (p2Dice) {
        p2Dice.innerHTML = Array(5).fill('<div class="d8-die black" style="opacity:0.45; width:44px; height:50px;"><span class="d8-die-val" style="font-size:1.3rem;">-</span></div>').join('');
      }
    };

    window.rollReconInitiative = function() {
      const btn = document.getElementById('btnRollReconInit');
      const verdict = document.getElementById('reconInitVerdict');
      const p1Dice = document.getElementById('reconInitP1Dice');
      const p2Dice = document.getElementById('reconInitP2Dice');
      const scoreP1 = document.getElementById('reconInitP1Score');
      const scoreP2 = document.getElementById('reconInitP2Score');

      if (btn) btn.disabled = true;
      if (verdict) {
        verdict.className = 'dice-scoreboard-badge idle';
        verdict.textContent = 'LANZANDO TEST DE RECON (5 DADOS A 5+)...';
      }
      if (scoreP1) scoreP1.textContent = '(Tirando...)';
      if (scoreP2) scoreP2.textContent = '(Tirando...)';

      const frames = [
        ...Array(8).fill({ delay: 60, phase: 'rolling-fast' }),
        ...Array(5).fill({ delay: 100, phase: 'rolling-med' }),
        ...Array(3).fill({ delay: 160, phase: 'rolling-slow' })
      ];

      let frameIdx = 0;
      function stepFrame() {
        const cur = frames[frameIdx];
        if (p1Dice) {
          p1Dice.innerHTML = Array(5).fill(0).map(() => `
            <div class="d8-die white ${cur.phase}" style="width:44px; height:50px;">
              <span class="d8-die-val" style="font-size:1.3rem;">${rollD8()}</span>
            </div>
          `).join('');
        }
        if (p2Dice) {
          p2Dice.innerHTML = Array(5).fill(0).map(() => `
            <div class="d8-die black ${cur.phase}" style="width:44px; height:50px;">
              <span class="d8-die-val" style="font-size:1.3rem;">${rollD8()}</span>
            </div>
          `).join('');
        }
        frameIdx++;
        if (frameIdx < frames.length) {
          setTimeout(stepFrame, cur.delay);
        } else {
          setTimeout(finalizeInit, 120);
        }
      }

      function finalizeInit() {
        const p1Rolls = Array.from({ length: 5 }, () => rollD8());
        const p2Rolls = Array.from({ length: 5 }, () => rollD8());

        const p1Successes = p1Rolls.filter(v => v >= 5).length;
        const p2Successes = p2Rolls.filter(v => v >= 5).length;

        if (p1Dice) {
          p1Dice.innerHTML = p1Rolls.map(v => {
            const isSucc = v >= 5;
            return `
              <div class="d8-die white ${isSucc ? 'success' : 'fail'}" style="width:44px; height:50px;">
                <span class="d8-die-val" style="font-size:1.3rem;">${v}</span>
                <span class="d8-die-badge" style="font-size:0.6rem;">${isSucc ? '✔' : ''}</span>
              </div>
            `;
          }).join('');
        }

        if (p2Dice) {
          p2Dice.innerHTML = p2Rolls.map(v => {
            const isSucc = v >= 5;
            return `
              <div class="d8-die black ${isSucc ? 'success' : 'fail'}" style="width:44px; height:50px;">
                <span class="d8-die-val" style="font-size:1.3rem;">${v}</span>
                <span class="d8-die-badge" style="font-size:0.6rem;">${isSucc ? '✔' : ''}</span>
              </div>
            `;
          }).join('');
        }

        if (scoreP1) scoreP1.textContent = `(${p1Successes} Éxito${p1Successes !== 1 ? 's' : ''})`;
        if (scoreP2) scoreP2.textContent = `(${p2Successes} Éxito${p2Successes !== 1 ? 's' : ''})`;

        const j1Win = p1Successes > p2Successes;
        const j2Win = p2Successes > p1Successes;
        const isTie = p1Successes === p2Successes;

        const btnWin = document.getElementById('btnRollReconWin');
        const btnLose = document.getElementById('btnRollReconLose');
        const titleWin = document.getElementById('reconWinTitle');
        const titleLose = document.getElementById('reconLoseTitle');
        const textWin = document.getElementById('reconWinText');
        const textLose = document.getElementById('reconLoseText');

        if (j1Win || j2Win) {
          reconState.hasInitiativeWinner = true;
          reconState.winnerPlayer = j1Win ? 'p1' : 'p2';
          reconState.winnerName = j1Win ? gameTrackerState.p1Name : gameTrackerState.p2Name;
          reconState.loserName = j1Win ? gameTrackerState.p2Name : gameTrackerState.p1Name;
          const diff = Math.min(2, Math.abs(p1Successes - p2Successes));
          reconState.winnerDiff = diff;

          if (titleWin) titleWin.innerHTML = `<span class="ui-icon icon-winner"></span> EFECTO GANADOR (${reconState.winnerName})`;
          if (titleLose) titleLose.innerHTML = `<span class="ui-icon icon-shield"></span> EFECTO PERDEDOR (${reconState.loserName})`;

          if (verdict) {
            verdict.className = 'dice-scoreboard-badge hit';
            verdict.textContent = `¡GANA ${reconState.winnerName}! (${Math.max(p1Successes, p2Successes)} vs ${Math.min(p1Successes, p2Successes)} éxitos - Diferencia: ${diff} dado${diff > 1 ? 's' : ''})`;
          }

          if (btnWin && !reconState.winnerRolled) {
            btnWin.disabled = false;
            btnWin.style.opacity = '1';
            btnWin.style.cursor = 'pointer';
            btnWin.innerHTML = `<span class="ui-icon icon-dice"></span> TIRAR D8 (${diff} DADO${diff > 1 ? 'S' : ''})`;
          }
          if (btnLose && !reconState.loserRolled) {
            btnLose.disabled = false;
            btnLose.style.opacity = '1';
            btnLose.style.cursor = 'pointer';
            btnLose.innerHTML = `<span class="ui-icon icon-dice"></span> TIRAR D8 (1 DADO)`;
          }
          if (textWin && textWin.textContent.includes('Bloqueado') && !reconState.winnerRolled) {
            textWin.textContent = `Pulsa TIRAR D8 para consultar ${diff} ventaja${diff > 1 ? 's' : ''}.`;
            textWin.style.color = '#cbd5e1';
          }
          if (textLose && textLose.textContent.includes('Bloqueado') && !reconState.loserRolled) {
            textLose.textContent = 'Pulsa TIRAR D8 para consultar 1 ventaja.';
            textLose.style.color = '#cbd5e1';
          }
        } else {
          reconState.hasInitiativeWinner = false;
          if (verdict) {
            verdict.className = 'dice-scoreboard-badge tied';
            verdict.textContent = `EMPATE (${p1Successes} vs ${p2Successes} éxitos) - ¡VUELVE A TIRAR!`;
          }
          if (btnWin) {
            btnWin.disabled = true;
            btnWin.style.opacity = '0.4';
            btnWin.style.cursor = 'not-allowed';
          }
          if (btnLose) {
            btnLose.disabled = true;
            btnLose.style.opacity = '0.4';
            btnLose.style.cursor = 'not-allowed';
          }
        }

        if (btn) btn.disabled = false;
      }

      stepFrame();
    };

    window.rollReconWinner = function() {
      const text = document.getElementById('reconWinText');
      const btn = document.getElementById('btnRollReconWin');
      const dieCont = document.getElementById('reconWinDieContainer');

      if (btn) btn.disabled = true;

      const diceCount = reconState.winnerDiff || 1;
      const frames = [
        ...Array(8).fill({ delay: 60, phase: 'rolling-fast' }),
        ...Array(5).fill({ delay: 100, phase: 'rolling-med' }),
        ...Array(3).fill({ delay: 160, phase: 'rolling-slow' })
      ];

      let frameIdx = 0;
      function stepFrame() {
        const cur = frames[frameIdx];
        if (dieCont) {
          dieCont.innerHTML = Array(diceCount).fill(0).map(() => `
            <div class="d8-die white ${cur.phase}">
              <span class="d8-die-val">${rollD8()}</span>
            </div>
          `).join('');
        }
        frameIdx++;
        if (frameIdx < frames.length) {
          setTimeout(stepFrame, cur.delay);
        } else {
          setTimeout(finalizeWin, 120);
        }
      }

      function finalizeWin() {
        let val1 = rollD8();
        let val2 = null;
        if (diceCount === 2) {
          val2 = rollD8();
          while (val2 === val1) {
            val2 = rollD8();
          }
        }

        reconState.winnerRolled = true;

        if (dieCont) {
          if (diceCount === 2) {
            dieCont.innerHTML = `
              <div class="d8-die white success">
                <span class="d8-die-val">${val1}</span>
              </div>
              <div class="d8-die white success">
                <span class="d8-die-val">${val2}</span>
              </div>
            `;
          } else {
            dieCont.innerHTML = `
              <div class="d8-die white success">
                <span class="d8-die-val">${val1}</span>
              </div>
            `;
          }
        }

        if (text) {
          if (diceCount === 2) {
            text.innerHTML = `
              <div style="margin-bottom:6px; padding-bottom:6px; border-bottom:1px solid rgba(255,255,255,0.1);">
                <strong>Dado ${val1}:</strong> ${RECON_WINNER_EFFECTS[val1]}
              </div>
              <div>
                <strong>Dado ${val2}:</strong> ${RECON_WINNER_EFFECTS[val2]}
              </div>
            `;
          } else {
            text.innerHTML = `<strong>Dado ${val1}:</strong> ${RECON_WINNER_EFFECTS[val1]}`;
          }
          text.style.color = '#cbd5e1';
        }

        if (btn) {
          btn.disabled = true;
          btn.style.opacity = '0.4';
          btn.style.cursor = 'not-allowed';
        }
      }

      stepFrame();
    };

    window.rollReconLoser = function() {
      const text = document.getElementById('reconLoseText');
      const btn = document.getElementById('btnRollReconLose');
      const dieCont = document.getElementById('reconLoseDieContainer');

      if (btn) btn.disabled = true;

      const frames = [
        ...Array(8).fill({ delay: 60, phase: 'rolling-fast' }),
        ...Array(5).fill({ delay: 100, phase: 'rolling-med' }),
        ...Array(3).fill({ delay: 160, phase: 'rolling-slow' })
      ];

      let frameIdx = 0;
      function stepFrame() {
        const cur = frames[frameIdx];
        if (dieCont) {
          dieCont.innerHTML = `
            <div class="d8-die black ${cur.phase}">
              <span class="d8-die-val">${rollD8()}</span>
            </div>
          `;
        }
        frameIdx++;
        if (frameIdx < frames.length) {
          setTimeout(stepFrame, cur.delay);
        } else {
          setTimeout(finalizeLose, 120);
        }
      }

      function finalizeLose() {
        const val = rollD8();
        reconState.loserRolled = true;

        if (dieCont) {
          dieCont.innerHTML = `
            <div class="d8-die black headshot">
              <span class="d8-die-val">${val}</span>
            </div>
          `;
        }

        if (text) {
          text.innerHTML = `<strong>Dado ${val}:</strong> ${RECON_LOSER_EFFECTS[val]}`;
          text.style.color = '#cbd5e1';
        }

        if (btn) {
          btn.disabled = true;
          btn.style.opacity = '0.4';
          btn.style.cursor = 'not-allowed';
        }
      }

      stepFrame();
    };

    let simpleCheckState = {
      count: 3,
      target: 4,
      required: 1
    };

    window.changeSimpleCheckCount = function(delta) {
      simpleCheckState.count = Math.max(1, Math.min(8, simpleCheckState.count + delta));
      const el = document.getElementById('dispSimpleCheckCount');
      if (el) el.textContent = simpleCheckState.count;
    };

    window.setSimpleTarget = function(val) {
      simpleCheckState.target = parseInt(val, 10) || 4;
      [3, 4, 5, 6].forEach(v => {
        const btn = document.getElementById('btnSimpleDiff' + v);
        if (btn) btn.classList.toggle('active', v === simpleCheckState.target);
      });
    };

    window.changeSimpleCheckRequired = function(delta) {
      simpleCheckState.required = Math.max(0, Math.min(6, simpleCheckState.required + delta));
      const el = document.getElementById('dispSimpleCheckReq');
      if (el) el.textContent = simpleCheckState.required;
    };

    window.rollSimpleCheck = function() {
      const grid = document.getElementById('simpleCheckDiceGrid');
      const resText = document.getElementById('simpleCheckResultText');
      const btn = document.getElementById('btnRollSimpleCheck');

      if (btn) btn.disabled = true;
      if (resText) {
        resText.innerHTML = '<span style="color:#7b96b3;">Lanzando dados de chequeo...</span>';
      }

      const frames = [
        ...Array(8).fill({ delay: 60, phase: 'rolling-fast' }),
        ...Array(5).fill({ delay: 100, phase: 'rolling-med' }),
        ...Array(2).fill({ delay: 160, phase: 'rolling-slow' })
      ];

      let frameIdx = 0;
      function stepFrame() {
        const cur = frames[frameIdx];
        if (grid) {
          grid.innerHTML = Array.from({ length: simpleCheckState.count }).map(() => `
            <div class="d8-die white ${cur.phase}">
              <span class="d8-die-val">${rollD8()}</span>
              <span class="d8-die-badge">...</span>
            </div>
          `).join('');
        }
        frameIdx++;
        if (frameIdx < frames.length) {
          setTimeout(stepFrame, cur.delay);
        } else {
          setTimeout(finalizeSimpleCheck, 120);
        }
      }

      function finalizeSimpleCheck() {
        let successes = 0;
        const dice = [];
        for (let i = 0; i < simpleCheckState.count; i++) {
          const val = rollD8();
          const isSuccess = val >= simpleCheckState.target;
          if (isSuccess) successes++;
          dice.push({ val, isSuccess });
        }

        if (grid) {
          grid.innerHTML = dice.map(d => `
            <div class="d8-die white ${d.isSuccess ? 'success' : 'fail'}">
              <span class="d8-die-val">${d.val}</span>
              <span class="d8-die-badge">${d.isSuccess ? '✔' : '❌'}</span>
            </div>
          `).join('');
        }

        if (resText) {
          const passed = successes >= simpleCheckState.required;
          const color = passed ? '#8df5a0' : '#ef4444';
          const statusText = passed ? '✔ ¡TEST SUPERADO!' : '❌ TEST FALLIDO';
          resText.innerHTML = `
            <span style="color:${color}; font-weight:800; font-size:0.95rem;">${statusText}</span><br>
            <span style="font-size:0.8rem; color:#cbd5e1;">(${successes} de ${simpleCheckState.required} éxito(s) requeridos con dificultad ${simpleCheckState.target}+)</span>
          `;
        }

        if (btn) btn.disabled = false;
      }

      stepFrame();
    };

    // GENERADOR HTML REPARADO
    function getAbilityBadge(name, desc) {
      const n = (name || '').toLowerCase();
      const d = (desc || '').toLowerCase();
      if (n.includes('reacción') || n.includes('reaccion') || d.includes('reacción') || d.includes('reaccion')) {
        return '<span class="ability-badge badge-reaction">REACCIÓN</span>';
      }
      if (n.includes('activa') || d.includes('acción') || d.includes('accion') || d.includes('test de')) {
        return '<span class="ability-badge badge-active">ACCIÓN</span>';
      }
      if (n.includes('pasiva') || d.includes('gana') || d.includes('ignora') || d.includes('siempre')) {
        return '<span class="ability-badge badge-passive">PASIVA</span>';
      }
      return '<span class="ability-badge badge-rule">REGLA</span>';
    }

    // DICCIONARIO ROBUSTO DE PALABRAS CLAVE
    function getKeywordExplanation(kwRaw) {
      if (!kwRaw) return null;
      const dict = (window.FLASHPOINT_DATA && window.FLASHPOINT_DATA.keywords) || {};
      
      const rawLower = kwRaw.trim().toLowerCase();
      const baseClean = kwRaw.split('(')[0].trim().toLowerCase();
      const matchParam = kwRaw.match(/\(([^)]+)\)/);
      const paramVal = matchParam ? matchParam[1].trim() : null;

      let foundDesc = null;
      if (dict[rawLower]) foundDesc = dict[rawLower];
      else if (dict[baseClean]) foundDesc = dict[baseClean];

      if (!foundDesc) {
        const aliases = {
          'two-use': 'two-uses',
          'continuou fire': 'continuous fire',
          'stealthe': 'stealthy',
          'stealth': 'stealthy',
          'energy shield': 'energy shield barrier',
          'escudo': 'energy shield barrier',
          'fragmentation granade': 'frag'
        };
        const aliasKey = aliases[baseClean] || aliases[rawLower];
        if (aliasKey && dict[aliasKey]) {
          foundDesc = dict[aliasKey];
        }
      }

      if (!foundDesc) {
        for (let k in dict) {
          if (k.startsWith(baseClean) || baseClean.startsWith(k)) {
            foundDesc = dict[k];
            break;
          }
        }
      }

      if (foundDesc) {
        let cleanDesc = foundDesc;
        if (paramVal && cleanDesc.includes('(n)')) {
          cleanDesc = cleanDesc.replace(/\(n\)/g, paramVal);
        }
        cleanDesc = cleanDesc.replace(/^\.\s*\+?\s*/, '+').replace(/\+\s+(\d)/, '+$1').replace(/\s*\.\s*([A-Za-z0-9ÁÉÍÓÚáéíóú])/g, '. $1').trim();
        return cleanDesc;
      }

      return null;
    }

    function formatWeaponTraits(traitsStr) {
      if (!traitsStr || traitsStr === '-') return '-';
      return traitsStr.split(',').map(t => {
        const tr = t.trim();
        if (!tr) return '';
        const safeTr = tr.replace(/'/g, "\\'");
        return `<span class="wp-trait-pill" onclick="handleKeywordClick(event, '${safeTr}')" title="Toca para ver regla">${tr}</span>`;
      }).join(' ');
    }

    let activeTooltipTarget = null;

    function handleKeywordClick(event, kwText) {
      event.preventDefault();
      event.stopPropagation();

      const tooltip = document.getElementById('tacticalTooltip');
      if (!tooltip) return;

      const currentTarget = event.currentTarget;

      // Si hace clic en el mismo elemento ya abierto, toggle (cerrar)
      if (tooltip.classList.contains('active') && activeTooltipTarget === currentTarget) {
        hideKeywordTooltip();
        return;
      }

      activeTooltipTarget = currentTarget;

      const titleEl = document.getElementById('ttTitle');
      const bodyEl = document.getElementById('ttBody');

      const desc = getKeywordExplanation(kwText) || 'Regla táctica del operativo o equipo. Consulta el libro de reglas de Halo Flashpoint.';

      titleEl.innerText = kwText;
      bodyEl.innerText = desc;

      // Posicionamiento centrado y adaptativo
      const rect = currentTarget.getBoundingClientRect();
      const tooltipWidth = Math.min(310, window.innerWidth - 24);
      let left = rect.left + (rect.width / 2) - (tooltipWidth / 2);
      let top = rect.bottom + 8;

      // Mantener dentro de los márgenes horizontales de la pantalla
      if (left + tooltipWidth > window.innerWidth - 12) {
        left = window.innerWidth - tooltipWidth - 12;
      }
      if (left < 12) left = 12;

      // Si no cabe abajo en la ventana, desplegar encima del botón
      if (top + 160 > window.innerHeight) {
        top = Math.max(12, rect.top - 150);
      }

      tooltip.style.width = `${tooltipWidth}px`;
      tooltip.style.left = `${Math.round(left)}px`;
      tooltip.style.top = `${Math.round(top)}px`;
      tooltip.classList.add('active');
    }

    function hideKeywordTooltip() {
      const tooltip = document.getElementById('tacticalTooltip');
      if (tooltip) {
        tooltip.classList.remove('active');
      }
      activeTooltipTarget = null;
    }

    // Cerrar tooltip al hacer clic o tap fuera de él
    document.addEventListener('pointerdown', (e) => {
      const tooltip = document.getElementById('tacticalTooltip');
      if (tooltip && tooltip.classList.contains('active')) {
        // Si el toque no es dentro del tooltip ni en una palabra clave interactiva
        if (!tooltip.contains(e.target) && !e.target.closest('.wp-trait-pill') && !e.target.closest('.kw-pill')) {
          hideKeywordTooltip();
        }
      }
    });

    // GENERADOR HTML MEJORADO CON ARTE OFICIAL Y MODO WARGAME
    function getWarscrollHTML(unit, context) {
      const activeSquad = squads.find(s => s.id === activeSquadId);
      const isWargame = activeSquad && (activeSquad.mode || '').toLowerCase() === 'wargame';
      const useWargameLoadout = (context === 'SQUAD' || context === 'PRINT') && isWargame;

      // Armamento a mostrar (personalizado en Wargame o base de serie en Draft/DB)
      const weaponsToRender = (useWargameLoadout && unit.customWeapons && unit.customWeapons.length > 0) ? unit.customWeapons : (unit.weapons || []);

      let weaponsRows = '';
      if (weaponsToRender && weaponsToRender.length > 0) {
        weaponsRows = weaponsToRender.map(w => `
          <tr>
            <td class="td-wp">${w.name || '-'}</td>
            <td>${w.range || '-'}</td>
            <td>${w.ap || '-'}</td>
            <td>${formatWeaponTraits(w.traits)}</td>
          </tr>
        `).join('');
      } else {
        weaponsRows = `<tr><td colspan="4" style="padding:10px; color:#555;">Sin armamento base</td></tr>`;
      }

      // Caja de Granadas y Objetos Tácticos Wargame (solo en Wargame)
      let gearBoxHtml = '';
      if (useWargameLoadout && (unit.customGrenade || unit.customItem)) {
        let itemsHtml = '';
        if (unit.customGrenade) {
          const gTraits = formatWeaponTraits(unit.customGrenade.traits || '');
          itemsHtml += `
            <div class="gear-tag grenade">
              <span class="gear-icon">💣</span>
              <div style="flex:1;">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                  <strong>${unit.customGrenade.name}</strong> 
                  <span class="gear-cost">+${unit.customGrenade.cost} PTS</span>
                </div>
                <div style="font-size:0.8rem; margin:2px 0; opacity:0.9;">RA: ${unit.customGrenade.range || '-'} | AP: ${unit.customGrenade.ap || '-'}</div>
                <div>${gTraits}</div>
              </div>
            </div>
          `;
        }
        if (unit.customItem) {
          const iDesc = unit.customItem.effect || unit.customItem.traits || '';
          itemsHtml += `
            <div class="gear-tag tactical">
              <span class="gear-icon">🎒</span>
              <div style="flex:1;">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                  <strong>${unit.customItem.name}</strong> 
                  <span class="gear-cost">+${unit.customItem.cost} PTS</span>
                </div>
                <div style="font-size:0.8rem; margin-top:2px; opacity:0.9;">${iDesc}</div>
              </div>
            </div>
          `;
        }
        gearBoxHtml = `
          <div class="section-title">EQUIPAMIENTO PERSONALIZADO WARGAME</div>
          <div class="wargame-gear-box">
            ${itemsHtml}
          </div>
        `;
      }

      let abilitiesHtml = '';
      if (unit.abilities && unit.abilities.length > 0) {
        abilitiesHtml = unit.abilities.map(a => {
          let desc = a.desc || '';
          // Si la descripción está vacía o contiene texto de "referencia"
          if (!desc || desc.toLowerCase().includes('referencia')) {
            const resolved = getKeywordExplanation(a.name);
            if (resolved) {
              desc = resolved;
              a.desc = resolved; // Auto-actualizar en memoria
            }
          }
          // Sustituir (n) con el valor del parámetro si existe en el nombre, ej: Tactician (2) -> +2 dados
          const matchParam = (a.name || '').match(/\(([^)]+)\)/);
          if (matchParam && desc.includes('(n)')) {
            desc = desc.replace(/\(n\)/g, matchParam[1].trim());
          }
          desc = desc.replace(/^\.\s*\+?\s*/, '+').replace(/\+\s+(\d)/, '+$1').replace(/\s*\.\s*([A-Za-z0-9ÁÉÍÓÚáéíóú])/g, '. $1').trim();

          const badge = getAbilityBadge(a.name, desc);
          return `
          <div class="ability-block">
            <div class="ability-header">
              <span class="ability-name">${a.name}</span>
              ${badge}
            </div>
            <div class="ability-desc">${desc}</div>
          </div>
          `;
        }).join('');
      }

      let keywordsHtml = (unit.keywords || '').split(',').map(k => k.trim()).filter(Boolean).map(k => {
        const safeK = k.replace(/'/g, "\\'");
        return `<span class="kw-pill" onclick="handleKeywordClick(event, '${safeK}')" title="Toca para ver regla">${k}</span>`;
      }).join('');

      let actionButton = '';
      if(context === 'DB') {
        actionButton = `
          <div style="display:flex; gap:8px; width:100%;">
            <button id="btnAddSquad" class="btn-action-squad add" style="flex:1;" onclick="addUnitToSquad('${unit.id}')">➕ AÑADIR A ESCUADRA</button>
            ${unit.isCustom ? `<button class="btn-action-squad remove" onclick="deleteCustomUnit('${unit.id}')" title="Dar de baja este operativo de los barracones">🗑️ DAR DE BAJA</button>` : ''}
          </div>
        `;
      } else if (context === 'SQUAD') {
        if (isWargame) {
          actionButton = `
            <div style="display:flex; gap:8px; width:100%;">
              <button class="btn-action-squad config" onclick="openLoadoutModal('${unit.uniqueUid}')">⚙️ PERSONALIZAR WARGAME</button>
              <button class="btn-action-squad remove" onclick="removeUnitFromSquad('${unit.uniqueUid}')">✖ QUITAR DE ESCUADRA</button>
            </div>
          `;
        } else {
          actionButton = `
            <div style="display:flex; gap:8px; width:100%;">
              <button class="btn-action-squad remove" onclick="removeUnitFromSquad('${unit.uniqueUid}')">✖ QUITAR DE ESCUADRA</button>
            </div>
          `;
        }
      }

      const isBanished = (unit.faction || '').toLowerCase().includes('banished');
      const headerClass = isBanished ? 'ws-header ws-banished' : 'ws-header';
      const factionIcon = isBanished ? '<span class="ui-icon icon-banished"></span>' : '<span class="ui-icon icon-unsc"></span>';

      let printClass = context === 'PRINT' ? (isBanished ? 'print-card ws-banished' : 'print-card') : '';
      let footerHTML = context !== 'PRINT' ? `<footer class="ws-footer">${actionButton}</footer>` : '';
      let shShape = unit.shield && unit.shield !== '-' && unit.shield !== '0' ? `<div class="shape-item shape-sh">SH ${unit.shield}</div>` : '';
      let abilSection = abilitiesHtml ? `
        <div class="section-title">CAPACIDADES Y REGLAS TÁCTICAS</div>
        <div class="abilities-container">${abilitiesHtml}</div>
      ` : '';

      // Cálculo y presentación de coste en tarjeta
      const baseCost = parseInt(unit.cost, 10) || 0;
      const totalUnitCost = (useWargameLoadout && unit.totalCost) ? unit.totalCost : baseCost;
      const costBadgeContent = (totalUnitCost !== baseCost)
        ? `${totalUnitCost} PTS <span style="font-size:0.65rem; font-weight:normal; display:block; opacity:0.85;">(${baseCost} + ${totalUnitCost - baseCost} Eq.)</span>`
        : `${baseCost} PTS`;

      // Ilustración (oficial o personalizada de miniatura pintada)
      const customImg = customPhotosCache[unit.id];
      const finalImage = customImg || unit.image;
      const isCustomPhoto = !!customImg;

      let artHtml = '';
      const imgLoading = context === 'PRINT' ? 'eager' : 'lazy';
      if (finalImage) {
        artHtml = `
          <div class="ws-unit-art-wrapper" ${context !== 'PRINT' ? `onclick="openPhotoActionModal('${unit.id}', ${isCustomPhoto})" title="Haz clic para personalizar o cambiar la foto de tu miniatura"` : ''}>
            <img class="ws-unit-art" src="${finalImage}" alt="${unit.name}" loading="${imgLoading}" onerror="this.parentElement.style.display='none'">
            ${context !== 'PRINT' ? `<div class="ws-unit-art-badge" title="Haz clic para gestionar foto">📷</div>` : ''}
          </div>
        `;
      } else {
        artHtml = `
          <div class="ws-unit-art-wrapper" ${context !== 'PRINT' ? `onclick="openPhotoActionModal('${unit.id}', false)" title="Haz clic para subir foto de tu miniatura"` : ''}>
            <div class="ws-unit-art-fallback">[ ${unit.faction} ]<br><span style="font-size:1.5rem;display:block;margin-top:6px;">${factionIcon}</span></div>
            ${context !== 'PRINT' ? `<div class="ws-unit-art-badge" title="Haz clic para subir foto">📷</div>` : ''}
          </div>
        `;
      }

      return `
        <div class="warscroll ${printClass}">
          <header class="${headerClass}">
            <div class="ws-title">
              <span class="ws-faction-badge">${factionIcon} ${unit.faction}</span>
              ${unit.name}
            </div>
            <div class="ws-cost">${costBadgeContent}</div>
          </header>

          <div class="ws-body">
            <!-- BLOQUE SUPERIOR: ILUSTRACIÓN + ESTADÍSTICAS -->
            <div class="ws-top-grid">
              ${artHtml}
              <div class="ws-top-stats-col">
                <div class="kw-container">${keywordsHtml}</div>
                <div class="top-stats-row">
                  <table class="core-stats-table">
                    <thead><tr><th>RA</th><th>FI</th><th>SV</th></tr></thead>
                    <tbody><tr><td>${unit.sht}</td><td>${unit.fgt}</td><td>${unit.srv}</td></tr></tbody>
                  </table>
                </div>
                <div class="shapes-container">
                  <div class="shape-item shape-sp">SP ${unit.move}</div>
                  <div class="shape-item shape-ar">AR ${unit.arm}</div>
                  <div class="shape-item shape-hp">HP ${unit.hp}</div>
                  ${shShape}
                </div>
              </div>
            </div>

            <!-- ARSENAL -->
            <div class="section-title">ARSENAL DE COMBATE</div>
            <table class="wp-table">
              <thead><tr><th class="th-wp">WP (ARMA)</th><th>RA (ALCANCE)</th><th>AP (PENETRACIÓN)</th><th>KW (RASGOS)</th></tr></thead>
              <tbody>${weaponsRows}</tbody>
            </table>

            <!-- EQUIPAMIENTO WARGAME -->
            ${gearBoxHtml}

            <!-- REGLAS -->
            ${abilSection}
          </div>

          ${footerHTML}
        </div>
      `;
    }

    function renderDatacard(unit, context) {
      currentSelectedId = context === 'DB' ? unit.id : unit.uniqueUid;
      if(context === 'DB') renderUnitList();
      if(context === 'SQUAD') renderSquadList();
      mainContainer.innerHTML = '<button class="btn-back-list" onclick="closeCardMobile()"><span class="ui-icon icon-recon" style="width:16px; height:16px; display:inline-block;"></span> VOLVER A LA LISTA</button>' + getWarscrollHTML(unit, context);
      document.getElementById('view-database').classList.add('show-card-mobile'); document.getElementById('mainContainer').scrollTop = 0;
    }

    // DEDUPLICADOR Y GENERADOR DE GLOSARIO DE REFERENCIA TÁCTICA PARA IMPRESIÓN
    function getSquadKeywordsReferenceCardHTML(activeSquad) {
      if (!activeSquad || !activeSquad.units || activeSquad.units.length === 0) return '';

      const kwMap = new Map();

      function addRawKeyword(raw) {
        if (!raw || raw === '-') return;
        const items = raw.split(',');
        items.forEach(item => {
          const clean = item.trim();
          if (!clean || clean === '-') return;

          // Extraer base y parámetros: ej. "Lethal (1)" -> base "lethal", param "1"
          const match = clean.match(/^([^\(]+)(?:\((.*)\))?$/);
          if (!match) return;

          const baseClean = match[1].trim();
          const baseKey = baseClean.toLowerCase();
          const param = match[2] ? match[2].trim() : null;

          if (!kwMap.has(baseKey)) {
            const explanation = getKeywordExplanation(clean) || getKeywordExplanation(baseClean) || 'Regla o rasgo táctico del juego.';
            kwMap.set(baseKey, {
              baseKey: baseKey,
              rawName: baseClean,
              params: new Set(),
              explanation: explanation
            });
          }

          if (param) {
            kwMap.get(baseKey).params.add(param);
          }
        });
      }

      const isWargame = (activeSquad.mode || '').toLowerCase() === 'wargame';

      // 1. Recorrer todas las miniaturas de la escuadra
      activeSquad.units.forEach(u => {
        // Palabras clave propias de la miniatura
        addRawKeyword(u.keywords);

        // Armas (personalizadas en Wargame o base de serie en Draft)
        const weapons = (isWargame && u.customWeapons && u.customWeapons.length > 0) ? u.customWeapons : (u.weapons || []);
        weapons.forEach(w => {
          addRawKeyword(w.traits);
        });

        if (isWargame) {
          // Granadas equipadas
          if (u.customGrenade && u.customGrenade.traits) {
            addRawKeyword(u.customGrenade.traits);
          }

          // Objetos tácticos equipados
          if (u.customItem && u.customItem.traits) {
            addRawKeyword(u.customItem.traits);
          }
        }
      });

      if (kwMap.size === 0) return '';

      // 2. Ordenar alfabéticamente por nombre
      const sortedKeywords = Array.from(kwMap.values()).sort((a, b) => a.rawName.localeCompare(b.rawName));

      const itemsHtml = sortedKeywords.map(item => {
        let paramStr = '';
        if (item.params.size > 0) {
          const sortedParams = Array.from(item.params).sort((a, b) => {
            const numA = parseInt(a, 10);
            const numB = parseInt(b, 10);
            if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
            return a.localeCompare(b);
          });
          paramStr = ` (${sortedParams.join(', ')})`;
        }
        const fullTitle = item.rawName.toUpperCase() + paramStr;

        return `
          <div class="ref-kw-item">
            <div class="ref-kw-name">
              <span class="ref-kw-dot">▪</span>
              <span>${fullTitle}</span>
            </div>
            <div class="ref-kw-desc">${item.explanation}</div>
          </div>
        `;
      }).join('');

      return `
        <div class="print-card print-reference-card">
          <div class="ws-header" style="background:#f1f5f9; border-bottom:2px solid #cbd5e1;">
            <div class="ws-title" style="color:#0f172a;">
              <span class="ws-faction-badge">GLOSARIO</span>
              <span class="ui-icon icon-rules"></span> GUÍA DE REFERENCIA TÁCTICA: PALABRAS CLAVE Y RASGOS DE LA ESCUADRA
            </div>
            <div class="ws-cost" style="font-size:0.95rem; padding:2px 10px; border-color:#334155; color:#334155;">
              ${sortedKeywords.length} REGLAS
            </div>
          </div>
          <div class="ws-body" style="padding:12px 16px;">
            <div class="reference-grid">
              ${itemsHtml}
            </div>
          </div>
        </div>
      `;
    }

    window.prepareAndPrintSquad = function() {
      const activeSquad = squads.find(s => s.id === activeSquadId);
      if(!activeSquad || activeSquad.units.length === 0) {
        alert('Comando Denegado: La escuadra actual está vacía.');
        return;
      }
      
      let cardsHtml = '';
      activeSquad.units.forEach(u => {
        cardsHtml += getWarscrollHTML(u, 'PRINT');
      });

      const isWargame = (activeSquad.mode || '').toLowerCase() === 'wargame';
      const modeDossierLabel = isWargame ? `WAR GAMES (${activeSquad.pointsLimit || 200} PTS)` : 'DRAFT BÁSICO (ARMAS DE SERIE)';

      // Tarjeta de Órdenes y Mejoras de Mando (solo si estamos en Wargame)
      let ordersPrintHtml = '';
      if (isWargame) {
        const squadOrders = activeSquad.orders || [];
        const squadUpgrades = activeSquad.upgrades || [];
        const allOrders = (window.FLASHPOINT_DATA && window.FLASHPOINT_DATA.wargame && window.FLASHPOINT_DATA.wargame.orders) || [];
        const allUpgrades = (window.FLASHPOINT_DATA && window.FLASHPOINT_DATA.wargame && window.FLASHPOINT_DATA.wargame.upgrades) || [];

        if (squadOrders.length > 0 || squadUpgrades.length > 0) {
          let ordItemsHtml = '';
          squadOrders.forEach(ordName => {
            const ord = allOrders.find(o => o.name === ordName) || { name: ordName, cost: 0, timing: '-', unit: 'Escuadra', effect: '' };
            ordItemsHtml += `
              <div style="background:#f8fafc; border:1px solid #cbd5e1; border-left:4px solid #0284c7; padding:8px 12px; margin-bottom:8px; border-radius:3px;">
                <div style="display:flex; justify-content:space-between; align-items:center; font-weight:700;">
                  <span style="font-size:1rem; color:#0f172a;"><span class="ui-icon icon-armory"></span> ${ord.name}</span>
                  <span style="font-family:'Share Tech Mono', monospace; color:#0369a1;">+${ord.cost} PTS</span>
                </div>
                <div style="font-size:0.8rem; color:#475569; margin:3px 0;"><strong>Para:</strong> ${ord.unit} | <strong>Momento:</strong> ${ord.timing}</div>
                <div style="font-size:0.88rem; color:#1e293b;">${ord.effect}</div>
              </div>
            `;
          });

          squadUpgrades.forEach(upgName => {
            const upg = allUpgrades.find(u => u.name === upgName) || { name: upgName, cost: 0 };
            ordItemsHtml += `
              <div style="background:#f8fafc; border:1px solid #cbd5e1; border-left:4px solid #10b981; padding:8px 12px; margin-bottom:8px; border-radius:3px;">
                <div style="display:flex; justify-content:space-between; align-items:center; font-weight:700;">
                  <span style="font-size:1rem; color:#0f172a;">⚡ MEJORA: ${upg.name}</span>
                  <span style="font-family:'Share Tech Mono', monospace; color:#059669;">+${upg.cost} PTS</span>
                </div>
              </div>
            `;
          });

          ordersPrintHtml = `
            <div class="print-card" style="border-top-color:#0284c7; margin-bottom:7mm; page-break-inside:avoid; break-inside:avoid;">
              <div class="ws-header" style="background:#f0f9ff; border-bottom:2px solid #bae6fd;">
                <div class="ws-title" style="color:#0369a1;"><span class="ui-icon icon-armory"></span> ÓRDENES TÁCTICAS Y MEJORAS DE ESCUADRA</div>
                <div class="ws-cost" style="color:#0369a1; border-color:#0369a1;">MANDO</div>
              </div>
              <div class="ws-body">
                ${ordItemsHtml}
              </div>
            </div>
          `;
        }
      }

      // Guía de referencia de palabras clave únicas
      const referenceCardHtml = getSquadKeywordsReferenceCardHTML(activeSquad);

      // Actualizar contenedor local (fallback y Ctrl+P)
      if (printContainer) {
        printContainer.innerHTML = ordersPrintHtml + cardsHtml + referenceCardHtml;
      }

      // SISTEMA DE IMPRESIÓN AISLADO MEDIANTE IFRAME
      let printFrame = document.getElementById('haloPrintFrame');
      if (printFrame) {
        printFrame.remove();
      }

      printFrame = document.createElement('iframe');
      printFrame.id = 'haloPrintFrame';
      printFrame.style.position = 'fixed';
      printFrame.style.right = '0';
      printFrame.style.bottom = '0';
      printFrame.style.width = '0';
      printFrame.style.height = '0';
      printFrame.style.border = '0';
      printFrame.style.visibility = 'hidden';
      document.body.appendChild(printFrame);

      const squadPointsObj = getSquadTotalPoints(activeSquad);
      const totalSquadCost = squadPointsObj.total;

      const frameDoc = printFrame.contentWindow.document;
      frameDoc.open();
      frameDoc.write(`
        <!DOCTYPE html>
        <html lang="es">
        <head>
          <meta charset="utf-8">
          <title>${activeSquad.name} - Halo Flashpoint</title>
          <base href="${document.baseURI}">
          <link rel="stylesheet" href="fonts.css">
          <style>
            @page {
              size: A4 portrait;
              margin: 6mm;
            }
            * {
              box-sizing: border-box;
              margin: 0;
              padding: 0;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
              animation: none !important;
              transition: none !important;
            }
            body {
              background: #ffffff !important;
              color: #0f172a !important;
              font-family: 'Rajdhani', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              padding: 0;
              margin: 0;
              width: 100%;
            }
            .dossier-header {
              display: flex;
              justify-content: space-between;
              align-items: center;
              border-bottom: 2px solid #0f172a;
              padding-bottom: 5px;
              margin-bottom: 10px;
            }
            .dossier-title {
              font-size: 1.45rem;
              font-weight: 700;
              text-transform: uppercase;
              letter-spacing: 1px;
              color: #0f172a;
            }
            .dossier-meta {
              font-family: 'Share Tech Mono', monospace;
              font-size: 1.15rem;
              color: #475569;
              font-weight: bold;
            }
            .warscroll, .print-card {
              border: 2px solid #334155;
              border-top: 6px solid #187175;
              border-radius: 4px;
              margin-bottom: 4mm;
              background: #ffffff;
              color: #0f172a;
              page-break-inside: avoid;
              break-inside: avoid;
              overflow: hidden;
            }
            .print-card.ws-banished {
              border-top-color: #991b1b;
            }
            .ws-header {
              background: #f1f5f9;
              padding: 5px 12px;
              display: flex;
              justify-content: space-between;
              align-items: center;
              border-bottom: 2px solid #cbd5e1;
            }
            .print-card.ws-banished .ws-header {
              background: #fef2f2;
              border-bottom-color: #fca5a5;
            }
            .ws-title {
              font-weight: 700;
              font-size: 1.4rem;
              text-transform: uppercase;
              letter-spacing: 1px;
              display: flex;
              align-items: center;
              gap: 8px;
              color: #0f172a;
            }
            .ws-faction-badge {
              font-family: 'Share Tech Mono', monospace;
              font-size: 0.85rem;
              background: #e2e8f0;
              color: #1e293b;
              padding: 2px 7px;
              border-radius: 3px;
              border: 1px solid #cbd5e1;
            }
            .ws-cost {
              font-weight: 700;
              font-size: 1.35rem;
              background: #ffffff;
              color: #187175;
              padding: 2px 8px;
              border-radius: 4px;
              border: 2px solid #187175;
              text-align: right;
            }
            .print-card.ws-banished .ws-cost {
              color: #991b1b;
              border-color: #991b1b;
            }
            .ws-body {
              padding: 6px 12px;
            }
            .ws-top-grid {
              display: grid;
              grid-template-columns: 88px 1fr;
              gap: 10px;
              margin-bottom: 6px;
              align-items: center;
            }
            .ws-unit-art-wrapper {
              width: 84px;
              height: 84px;
              margin: 0 auto;
              border-radius: 50%;
              background: #f8fafc;
              border: 2px solid #187175;
              overflow: hidden;
              display: flex;
              justify-content: center;
              align-items: center;
            }
            .print-card.ws-banished .ws-unit-art-wrapper {
              border-color: #991b1b;
            }
            .ws-unit-art {
              width: 100%;
              height: 100%;
              object-fit: cover;
              object-position: 50% 20%;
              display: block;
            }
            .ws-unit-art-fallback {
              font-family: 'Share Tech Mono', monospace;
              font-size: 0.75rem;
              color: #475569;
              text-align: center;
              padding: 6px;
            }
            .ws-top-stats-col {
              display: flex;
              flex-direction: column;
              gap: 6px;
            }
            .kw-container {
              display: flex;
              justify-content: flex-end;
              gap: 4px;
              flex-wrap: wrap;
            }
            .kw-pill {
              border: 1px solid #475569;
              border-radius: 10px;
              padding: 2px 8px;
              font-size: 1rem;
              font-weight: 700;
              background: #ffffff;
              color: #0f172a;
            }
            .top-stats-row {
              display: flex;
              justify-content: flex-end;
              width: 100%;
            }
            .core-stats-table {
              width: 100%;
              border-collapse: collapse;
              text-align: center;
              border: 1px solid #94a3b8;
            }
            .core-stats-table th {
              background: #187175;
              color: #ffffff;
              padding: 3px;
              font-size: 1.15rem;
              font-weight: 700;
              border-right: 1px solid #ffffff;
            }
            .print-card.ws-banished .core-stats-table th {
              background: #991b1b;
            }
            .core-stats-table th:last-child {
              border-right: none;
            }
            .core-stats-table td {
              background: #f8fafc;
              color: #0f172a;
              padding: 4px 2px;
              font-size: 1.55rem;
              font-weight: 800;
              border-right: 1px solid #cbd5e1;
            }
            .core-stats-table td:last-child {
              border-right: none;
            }
            .shapes-container {
              display: flex;
              justify-content: flex-end;
              gap: 5px;
              align-items: center;
              flex-wrap: wrap;
            }
            .shape-item {
              display: flex;
              align-items: center;
              justify-content: center;
              font-weight: 800;
              font-size: 1.25rem;
              text-align: center;
            }
            .shape-sp {
              background: #187175;
              color: #ffffff;
              padding: 4px 8px 4px 14px;
              min-width: 62px;
              clip-path: polygon(0% 0%, 80% 0%, 100% 50%, 80% 100%, 0% 100%, 20% 50%);
            }
            .print-card.ws-banished .shape-sp {
              background: #991b1b;
            }
            .shape-ar {
              background: #334155;
              color: #ffffff;
              padding: 5px 8px 8px 8px;
              min-width: 50px;
              clip-path: polygon(0 0, 100% 0, 100% 65%, 50% 100%, 0 65%);
            }
            .shape-hp {
              background: #cbd5e1;
              color: #0f172a;
              padding: 6px 6px;
              min-width: 50px;
              clip-path: polygon(25% 0%, 75% 0%, 100% 25%, 100% 75%, 75% 100%, 25% 100%, 0% 75%, 0% 25%);
            }
            .shape-sh {
              background: #38bdf8;
              color: #0c4a6e;
              width: 44px;
              height: 38px;
              min-width: 44px;
              padding: 0;
              clip-path: polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%);
              font-weight: 800;
            }
            .section-title {
              font-family: 'Share Tech Mono', monospace;
              font-size: 1.05rem;
              font-weight: 700;
              color: #187175;
              text-transform: uppercase;
              letter-spacing: 1px;
              margin: 5px 0 2px 0;
              display: flex;
              align-items: center;
              gap: 8px;
            }
            .print-card.ws-banished .section-title {
              color: #991b1b;
            }
            .section-title::after {
              content: '';
              flex: 1;
              height: 1px;
              background: #cbd5e1;
            }
            .wp-table {
              width: 100%;
              border-collapse: collapse;
              text-align: center;
              margin-bottom: 5px;
              border: 1px solid #94a3b8;
            }
            .wp-table th {
              background: #475569;
              color: #ffffff;
              padding: 3px 5px;
              font-size: 1.05rem;
              font-weight: 700;
              border-bottom: 2px solid #94a3b8;
              letter-spacing: 0.5px;
            }
            .wp-table th.th-wp {
              text-align: left;
              padding-left: 10px;
              width: 36%;
            }
            .wp-table td {
              background: #ffffff;
              color: #0f172a;
              padding: 4px 5px;
              border-bottom: 1px solid #e2e8f0;
              font-size: 1.15rem;
              font-weight: 700;
            }
            .wp-table tr:nth-child(even) td {
              background: #f8fafc;
            }
            .wp-table td.td-wp {
              text-align: left;
              padding-left: 10px;
              font-weight: 700;
              color: #0f172a;
            }
            .wp-trait-pill {
              display: inline-flex;
              align-items: center;
              background: #ffffff;
              border: 1.5px solid #94a3b8;
              padding: 1px 6px;
              border-radius: 3px;
              font-size: 1.05rem;
              margin: 1px 2px;
              font-weight: 700;
              color: #0f172a;
            }
            .wargame-gear-box {
              display: flex;
              flex-direction: column;
              gap: 4px;
              margin-bottom: 5px;
            }
            .gear-tag {
              display: flex;
              align-items: flex-start;
              gap: 8px;
              background: #f8fafc;
              border: 1px solid #cbd5e1;
              border-radius: 4px;
              padding: 4px 8px;
              font-size: 1.12rem;
              font-weight: 600;
              color: #0f172a;
            }
            .gear-tag.grenade {
              border-left: 4px solid #ef4444;
            }
            .gear-tag.tactical {
              border-left: 4px solid #3b82f6;
            }
            .gear-icon {
              font-size: 1.1rem;
            }
            .gear-cost {
              font-family: 'Share Tech Mono', monospace;
              font-weight: bold;
              color: #0f172a;
            }
            .abilities-container {
              display: flex;
              flex-direction: column;
              gap: 4px;
            }
            .ability-block {
              background: #f8fafc;
              border-left: 3px solid #334155;
              padding: 5px 10px;
              border-radius: 0 3px 3px 0;
              margin-bottom: 2px;
            }
            .ability-header {
              display: flex;
              justify-content: space-between;
              align-items: center;
              margin-bottom: 2px;
            }
            .ability-name {
              font-weight: 700;
              font-size: 1.25rem;
              color: #0f172a;
            }
            .ability-badge {
              font-family: 'Share Tech Mono', monospace;
              font-size: 0.85rem;
              padding: 1px 5px;
              border-radius: 2px;
              font-weight: 700;
              text-transform: uppercase;
              border: 1px solid #94a3b8;
              background: #ffffff;
              color: #334155;
            }
            .ability-desc {
              font-size: 1.22rem;
              line-height: 1.35;
              color: #0f172a;
              font-weight: 600;
            }
            .print-reference-card {
              border-top-color: #187175;
              page-break-inside: avoid !important;
              break-inside: avoid !important;
              margin-top: 6mm;
            }
            .reference-grid {
              display: block;
              columns: 2;
              column-gap: 12px;
            }
            .ref-kw-item {
              background: #f8fafc;
              border: 1px solid #cbd5e1;
              border-left: 3px solid #187175;
              padding: 6px 10px;
              border-radius: 3px;
              display: inline-block;
              width: 100%;
              margin-bottom: 8px;
              box-sizing: border-box;
              page-break-inside: avoid !important;
              break-inside: avoid !important;
            }
            .ref-kw-name {
              font-family: 'Rajdhani', sans-serif;
              font-weight: 700;
              font-size: 1.25rem;
              color: #0f172a;
              text-transform: uppercase;
              letter-spacing: 0.5px;
              margin-bottom: 2px;
              display: flex;
              align-items: center;
              gap: 5px;
            }
            .ref-kw-dot {
              color: #187175;
              font-size: 1.2rem;
            }
            .ref-kw-desc {
              font-size: 1.2rem;
              line-height: 1.35;
              color: #0f172a;
              font-weight: 600;
            }
          </style>
        </head>
        <body>
          <div class="dossier-header">
            <div class="dossier-title">HALO FLASHPOINT - DOSSIER DE COMBATE</div>
            <div class="dossier-meta">ESCUADRA: ${activeSquad.name.toUpperCase()} | ${modeDossierLabel} | TOTAL: ${totalSquadCost} PTS</div>
          </div>
          ${ordersPrintHtml}
          ${cardsHtml}
          ${referenceCardHtml}
        </body>
        </html>
      `);
      frameDoc.close();

      // Esperar brevemente a que el DOM interno del iframe y los recursos se pinten
      setTimeout(() => {
        try {
          printFrame.contentWindow.focus();
          printFrame.contentWindow.print();
        } catch(err) {
          console.warn('Iframe print falló, usando fallback de ventana:', err);
          window.print();
        }
      }, 250);
    };

    factionSelect.addEventListener('change', () => { renderUnitList(); });
    searchUnit.addEventListener('input', () => { renderUnitList(); });

    // LECTOR DE EXCEL
    excelFileInput.addEventListener('change', async function(e) {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async function(evt) {
        try {
          const workbook = new ExcelJS.Workbook();
          await workbook.xlsx.load(evt.target.result);
          
          let keywordDict = {};
          let weaponDict = [];
          
          workbook.eachSheet((worksheet, sheetId) => {
            let sName = worksheet.name.toLowerCase();
            if (sName === 'keywords') {
              worksheet.eachRow((row, rowNumber) => {
                if (rowNumber > 1) {
                  let kw = row.getCell(1).text.trim();
                  let desc = row.getCell(2).text.trim();
                  if (kw) keywordDict[kw.toLowerCase()] = desc;
                }
              });
            }
            if (sName.startsWith('armas') || sName === 'granadas') {
              worksheet.eachRow((row, rowNumber) => {
                if (rowNumber > 1) {
                  let wName = row.getCell(1).text.trim();
                  let rango = row.getCell(3).text.trim();
                  let ap = row.getCell(4).text.trim();
                  let kw = row.getCell(5).text.trim();
                  if (wName && wName !== '-') {
                    weaponDict.push({ name: wName, range: rango, ap: ap, traits: kw });
                  }
                }
              });
            }
          });

          const excludeSheets = ['lista', 'referencia 3-4', 'referencia 5-6', 'ordenes', 'armas', 'granadas', 'objetos', 'mejoras', 'keywords', 'imagen', 'armas_base', 'armas_compra'];
          let parsedUnits = [];
          let unitIndex = 0;

          workbook.eachSheet((worksheet, sheetId) => {
            let sName = worksheet.name.toLowerCase();
            
            if (!excludeSheets.includes(sName)) {
              worksheet.eachRow((row, rowNumber) => {
                if (rowNumber > 1) {
                  let unitName = row.getCell(1).text.trim();
                  if (!unitName || unitName === '-') return;
                  
                  let costStr = row.getCell(2).text.trim() || '-';
                  
                  let movStr = '-';
                  let rawMovVal = row.getCell(6).value;

                  if (rawMovVal !== null && rawMovVal !== undefined) {
                      if (rawMovVal instanceof Date) {
                          // ExcelJS crea la fecha a medianoche UTC: leerla en UTC evita
                          // que en zonas horarias negativas (ej. México UTC-6) retroceda un día.
                          let m = rawMovVal.getUTCMonth() + 1;
                          let d = rawMovVal.getUTCDate();
                          movStr = `${Math.min(m, d)}/${Math.max(m, d)}`;
                      } 
                      else {
                          let txt = String(rawMovVal).trim();
                          let validNums = txt.match(/[0-9]/g);
                          if (validNums && validNums.length >= 2) {
                              movStr = `${Math.min(validNums[0], validNums[1])}/${Math.max(validNums[0], validNums[1])}`;
                          } else if (validNums && validNums.length === 1) {
                              movStr = validNums[0];
                          } else {
                              movStr = txt;
                          }
                      }
                  }

                  let weapons = [];
                  [9, 10, 11].forEach(colIdx => {
                    let wName = row.getCell(colIdx).text.trim();
                    if (wName && wName !== '-') {
                      let wStats = weaponDict.filter(w => w.name.toLowerCase() === wName.toLowerCase());
                      if (wStats.length > 0) { 
                        let uniqueStats = [];
                        let seen = new Set();
                        wStats.forEach(ws => {
                          let key = ws.name.toLowerCase() + '|' + ws.range;
                          if (!seen.has(key)) { seen.add(key); uniqueStats.push(ws); }
                        });
                        weapons.push(...uniqueStats); 
                      } 
                      else { weapons.push({ name: wName, range: '-', ap: '-', traits: '-' }); }
                    }
                  });

                  let rawKw = row.getCell(12).text.trim();
                  let kwArray = rawKw !== '-' ? rawKw.split(',').map(k => k.trim()) : [];
                  let shield = '-';
                  
                  let shieldIdx = kwArray.findIndex(k => k.toLowerCase().includes('energy shield') || k.toLowerCase().includes('escudo'));
                  if (shieldIdx !== -1) {
                    let match = kwArray[shieldIdx].match(/\d+/);
                    if (match) shield = match[0];
                    kwArray.splice(shieldIdx, 1);
                  }

                  let abilities = kwArray.map(k => {
                    let desc = getKeywordExplanation(k) || keywordDict[k.split('(')[0].trim().toLowerCase()] || 'Regla táctica del operativo.';
                    return { name: k, desc: desc }; 
                  });
                  
                  parsedUnits.push({
                    id: `fp-unit-${unitIndex++}`,
                    faction: worksheet.name,
                    name: unitName,
                    cost: costStr,
                    move: movStr,
                    sht: row.getCell(3).text.trim(),
                    fgt: row.getCell(4).text.trim(),
                    srv: row.getCell(5).text.trim(),
                    arm: row.getCell(7).text.trim(),
                    hp: row.getCell(8).text.trim(),
                    shield: shield,
                    weapons: weapons,
                    abilities: abilities,
                    keywords: kwArray.join(', ')
                  });
                }
              });
            }
          });

          if (parsedUnits.length === 0) { alert('No se encontraron Operativos en el archivo.'); return; }
          
          warscrollDatabase = parsedUnits;
          if (!window.FLASHPOINT_DATA) window.FLASHPOINT_DATA = {};
          window.FLASHPOINT_DATA.keywords = Object.assign({}, window.FLASHPOINT_DATA.keywords || {}, keywordDict);
          updateFactionDropdown(); 
          tabDB.click();
          
        } catch (err) { alert('Error al leer el archivo. Verifica que sea el formato correcto.'); console.error(err); }
      };
      reader.readAsArrayBuffer(file);
    });

    // ==============================================================
    // GESTOR DE DATOS PERSONALIZADOS, FOTOS E INDEXEDDB
    // ==============================================================
    const CUSTOM_DATA_KEY = 'haloFlashpointCustomData';
    let customData = {
      keywords: {},
      weapons: [],
      grenades: [],
      items: [],
      orders: [],
      units: []
    };
    let customPhotosCache = {};
    let targetUnitIdForPhoto = null;

    const IDB_NAME = 'HaloFlashpointDB';
    const IDB_VERSION = 1;
    let idbInstance = null;

    function getIDB() {
      if (idbInstance) return Promise.resolve(idbInstance);
      return new Promise((resolve, reject) => {
        const req = indexedDB.open(IDB_NAME, IDB_VERSION);
        req.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains('unitPhotos')) {
            db.createObjectStore('unitPhotos');
          }
        };
        req.onsuccess = (e) => {
          idbInstance = e.target.result;
          resolve(idbInstance);
        };
        req.onerror = (e) => reject(req.error);
      });
    }

    async function loadAllCustomPhotos() {
      try {
        const db = await getIDB();
        return new Promise((resolve) => {
          const tx = db.transaction('unitPhotos', 'readonly');
          const store = tx.objectStore('unitPhotos');
          const req = store.openCursor();
          const photos = {};
          req.onsuccess = (e) => {
            const cursor = e.target.result;
            if (cursor) {
              photos[cursor.key] = cursor.value;
              cursor.continue();
            } else {
              resolve(photos);
            }
          };
          req.onerror = () => resolve({});
        });
      } catch (err) {
        console.warn('Fallo al leer fotos en IndexedDB:', err);
        return {};
      }
    }

    async function saveUnitPhotoToDB(unitId, dataUrl) {
      try {
        const db = await getIDB();
        return new Promise((resolve, reject) => {
          const tx = db.transaction('unitPhotos', 'readwrite');
          const store = tx.objectStore('unitPhotos');
          const req = store.put(dataUrl, unitId);
          req.onsuccess = () => resolve(true);
          req.onerror = () => reject(req.error);
        });
      } catch (err) {
        console.error('Error guardando foto en IndexedDB:', err);
      }
    }

    async function deleteUnitPhotoFromDB(unitId) {
      try {
        const db = await getIDB();
        return new Promise((resolve, reject) => {
          const tx = db.transaction('unitPhotos', 'readwrite');
          const store = tx.objectStore('unitPhotos');
          const req = store.delete(unitId);
          req.onsuccess = () => resolve(true);
          req.onerror = () => reject(req.error);
        });
      } catch (err) {
        console.error('Error eliminando foto de IndexedDB:', err);
      }
    }

    function compressAndResizeImage(file, maxWidth = 480, maxHeight = 600, quality = 0.82) {
      return new Promise((resolve, reject) => {
        if (!file || !file.type.match(/^image\//)) {
          return reject(new Error('El archivo seleccionado no es una imagen válida.'));
        }
        const reader = new FileReader();
        reader.onload = (e) => {
          const img = new Image();
          img.onload = () => {
            let width = img.width;
            let height = img.height;
            if (width > maxWidth || height > maxHeight) {
              const ratio = Math.min(maxWidth / width, maxHeight / height);
              width = Math.round(width * ratio);
              height = Math.round(height * ratio);
            }
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL('image/jpeg', quality));
          };
          img.onerror = () => reject(new Error('No se pudo procesar la imagen seleccionada.'));
          img.src = e.target.result;
        };
        reader.onerror = () => reject(new Error('Fallo al leer el archivo del dispositivo.'));
        reader.readAsDataURL(file);
      });
    }

    function loadCustomData() {
      try {
        const raw = localStorage.getItem(CUSTOM_DATA_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === 'object') {
            if (parsed.keywords) customData.keywords = parsed.keywords;
            if (Array.isArray(parsed.weapons)) customData.weapons = parsed.weapons;
            if (Array.isArray(parsed.grenades)) customData.grenades = parsed.grenades;
            if (Array.isArray(parsed.items)) customData.items = parsed.items;
            if (Array.isArray(parsed.orders)) customData.orders = parsed.orders;
            if (Array.isArray(parsed.units)) customData.units = parsed.units;
          }
        }
      } catch (e) {
        console.warn('Fallo al cargar datos personalizados de localStorage:', e);
      }
    }

    function saveCustomData() {
      try {
        localStorage.setItem(CUSTOM_DATA_KEY, JSON.stringify(customData));
      } catch (e) {
        console.error('Error guardando datos personalizados:', e);
      }
    }

    const OFFICIAL_KEYWORDS_V25 = {
      "acrobatic": "Cada enemigo eliminado por este modelo otorga +1 Punto de Victoria (PV) en modos de juego donde las bajas otorgan puntos.",
      "active camouflage": "Mientras este modelo tenga sus escudos de energía totalmente cargados, solo se le puede trazar Línea de Visión (LdV) desde su mismo cubo o un cubo adyacente. Si no tiene escudos completos, se le traza LdV normal pero los ataques a distancia sufren -2 dados contra él (-1 si no tiene escudos).",
      "blast": "Antes de resolver el daño y efectos del arma, todos los modelos en cubos adyacentes a la explosión (en todas direcciones) pierden 1 escudo de energía.",
      "blaze away": "Disparo de Supresión: 4 dados a DISPARO (X) vs 3 dados de SOBREVIVIR del objetivo. Si el atacante tiene más éxitos, el objetivo agota 1 Escudo de Energía y queda Inmovilizado (Pinned). No causa daño, y no aplican bonificadores de agachado, armadura ni óptica.",
      "concussive": "Si el atacante obtiene más éxitos que el defensor en DISPARO o ASALTO, el objetivo queda Inmovilizado (Pinned) además de sufrir el daño. Si ataca a un cubo, afecta a todos los modelos en él.",
      "continuous fire": "Al disparar, gana Peso de Fuego (2). Al final de la acción de DISPARO, debe superar una prueba de SOBREVIVIR con 3 dados (dif. 2). Si falla, sufre 1 herida (ignora armadura y escudos). Si muere, la baja se otorga al oponente.",
      "drop wall": "Muro de Cobertura: Despliega una Barrera de Escudo de Energía (2) en el cubo del usuario.",
      "emp": "Agota inmediatamente todos los escudos de energía del modelo objetivo y de todos los modelos en su mismo cubo.",
      "energy shield": "Comienza la partida con (n) escudos de energía cargados. Al inicio de cada ronda, recupera 1 escudo agotado hasta su máximo (n).",
      "energy shield barrier": "Protege a todos los modelos en el mismo cubo contra ataques a distancia con (n) fichas de escudo. Se agotan primero antes de los escudos del propio modelo. No se regeneran.",
      "esd": "Drenador de Escudos (ESD): Al impactar en DISPARO o ASALTO, agota inmediatamente (n) escudos de energía del objetivo antes de resolver el daño restante.",
      "evade": "Si este modelo no está inmovilizado y es objetivo de DISPARO sin ser eliminado, inmovilizado ni forzado a moverse, puede hacer un AVANCE gratuito de 1 cubo inmediatamente (puede activar ASALTO).",
      "explosive": "DISPARO dirigido a un cubo en LdV con 3 dados a RANGED (1) sin modificadores ni rerolls. Éxito = impacta el cubo; fallo = se dispersa a un cubo adyacente en el mismo nivel (no rebota en muros). Luego resuelve los efectos del ataque.",
      "fast transition": "En una acción de DISPARO puede disparar 2 armas a distancia distintas declarando objetivos antes de tirar. Resuelve cada arma por separado. Con dado de mando solo da 1 disparo extra. No aplica en acciones largas.",
      "fearless": "Nunca puede quedar Inmovilizado (Pinned), incluso si lo causan otras reglas o ataques. Otros efectos del ataque sí aplican.",
      "fire": "Al activarse con ficha de FUEGO, puede usar una acción Auxiliar para retirarla; si no lo hace, al final de su activación sufre 1 herida y retira la ficha. Si muere, la baja se otorga al rival.",
      "firing platform": "Gana +(n) dados al realizar una acción de DISPARO con esta arma.",
      "flight": "Puede moverse a través de cubos sin paredes ni suelos, y cambiar de nivel sin trepar. No sufre daño ni queda inmovilizado por caídas.",
      "frag": "Tras impactar arma Explosiva o Granada, tira (n) dados a 4+ (fuerza del ataque). Cada modelo en el cubo tira 3 dados a SOBREVIVIR por separado. La diferencia en éxitos son impactos directos. Si Frag empata o supera en éxitos, los supervivientes quedan Inmovilizados (Pinned) y son lanzados 1 cubo en dirección aleatoria.",
      "grenade": "Se lanza con acción de DISPARO a un cubo dentro del alcance y visible desde arriba. Tira 3 dados a RANGED (1). Si falla, se dispersa (si choca con un muro o borde, rebota y cae en el cubo original).",
      "guarded": "Cuando es objetivo de DISPARO con tirada enfrentada (X), el atacante no se beneficia de tiradas de Headshot (dados extra con 8s).",
      "horde": "En combate cuerpo a cuerpo (Asalto), gana el bono habitual de aliados +1 dado extra por cada aliado con Horda en el mismo cubo (sin contarse a sí mismo).",
      "implosion": "Tras impactar arma Explosiva o Granada, tira (n) dados a 4+ (fuerza). Todos los modelos en el cubo tiran 3 dados a SOBREVIVIR. La diferencia en éxitos causa esa cantidad de impactos directos.",
      "imposing": "+1 dado en pruebas de LUCHA o SOBREVIVIR durante un ASALTO.",
      "incendiary": "Selecciona un cubo objetivo en alcance y LdV. Tira (n) dados a RANGED sin modificadores contra 3 dados a SOBREVIVIR de los modelos en el cubo. Los éxitos no cancelados causan impactos y todos los modelos en el cubo reciben una ficha de FUEGO.",
      "jump pack": "No sufre daño ni queda inmovilizado por caídas. Puede subir o bajar niveles sin trepar, saltar muros completos de 1 cubo (cuenta como 1 solo movimiento) y saltar huecos de hasta 1 cubo de ancho.",
      "knockback": "Al ganar una prueba de DISPARO o LUCHA, empuja al objetivo 1 cubo en línea recta al mismo nivel alejándolo del atacante.",
      "lethal": "Si el ataque causa heridas (tras escudos y armadura), añade (n) heridas adicionales en total. Es acumulable.",
      "life support": "Un solo uso. Si el modelo sufre heridas pero no muere, regresa inmediatamente a su estado sin daño de forma gratuita. No resucita modelos eliminados.",
      "long": "La acción normal de DISPARO con esta arma es una acción larga. El disparo Blaze Away con Fuego Rápido sigue siendo acción corta.",
      "lunge": "Se usa con acción de DISPARO (R1), pero realiza la tirada con la estadística de LUCHA en vez de DISPARO. Solo se beneficia de modificadores de tiro limpio y terreno elevado.",
      "medic": "Puede realizar una acción Auxiliar gratuita para retirar 1 herida de un modelo aliado en su mismo cubo.",
      "one-use": "Este objeto o arma solo puede utilizarse una vez por partida.",
      "optics": "+1 dado en acciones de DISPARO y logra Headshots con 7 y 8. No se puede combinar al hacer Fuego de Supresión (Blaze Away).",
      "pack mule": "Puede transportar hasta 3 objetos, 2 armas recogidas y 2 objetivos de escenario.",
      "rapid fire": "Puede disparar normalmente o realizar Fuego de Supresión (Blaze Away). Blaze Away tira 4 dados a DISPARO vs 3 dados a SOBREVIVIR del objetivo: si supera, drena 1 escudo y lo deja Inmovilizado (Pinned) sin causar daño.",
      "scout": "Antes de la primera ronda (tras despliegue), puede realizar un AVANCE gratuito de 1 cubo (puede recoger objetos o armas). Si su AVANCE es 1, al respawnear puede Agacharse gratis. Mantiene fichas de agachado al avanzar.",
      "smash": "+(n) dados al realizar una prueba de LUCHA en Asalto.",
      "sniper scope": "Permite disparar como acción corta normal (sin bonos) o como acción larga ganando +2 dados a DISPARO y Headshots con 7 y 8.",
      "stable": "Puede ignorar la clave Long en cualquier arma si realiza una acción de AVANCE seguida de DISPARO en su activación.",
      "stealthy": "Cuando es objetivo de una acción de DISPARO, el oponente sufre -1 dado en su tirada de ataque.",
      "sticky": "Con 3+ éxitos al realizar la tirada de DISPARO, agota todos los escudos de energía de 1 modelo en el cubo objetivo.",
      "stoic": "Nunca puede quedar Inmovilizado (Pinned) ni agacharse. Otros efectos de ataque aplican normalmente.",
      "support weapon": "Quien porte esta arma pesada no puede Correr (Sprint) ni lanzar granadas, su VELOCIDAD máxima es 1 y no tira dados en pruebas de LUCHA en Asalto. Recogerla del suelo finaliza inmediatamente su movimiento.",
      "suppression": "Además de causar impactos y heridas normales, deja Inmovilizados (Pinned) a todos los modelos (aliados y enemigos) en el cubo objetivo.",
      "tactician": "Mientras esté en el tablero: añade +(n) dados de mando al inicio de la ronda con (n) repeticiones (rerolls), y permite conservar hasta (n) dados no usados para la siguiente ronda. Acumulable entre varios estrategas.",
      "two-uses": "Este objeto o arma puede utilizarse dos veces antes de agotarse.",
      "unstoppable": "Al iniciar un Asalto entrando en un cubo con enemigo, recibe +3 dados a la prueba de LUCHA en lugar de los +2 habituales.",
      "weight of fire": "Puede repetir (n) dados al realizar pruebas de DISPARO. Acumulable.",
      // Objetos del PDF:
      "active camouflage (type ii)": "Un solo uso. Otorga la clave Camuflaje Activo al recogerlo. Se pierde si el modelo Corre, Lucha o Dispara.",
      "drop wall (type ii)": "Un solo uso. Coloca una Barrera de Escudo de Energía (2) en el cubo del portador.",
      "explosive ammo (type iii)": "Un solo uso. Se usa con un arma a distancia para ganar +1 dado y Letal (1) en una tirada de DISPARO. No compatible con Explosivo, Granada ni Lunge.",
      "grappleshot (type ii)": "Un solo uso. Permite hacer un AVANCE gratuito de 1 cubo (adicional a otras acciones), o recoger un objeto o arma en LdV en un cubo adyacente.",
      "hardlight shield (type i)": "Efecto pasivo: +1 Armadura (AR). Se descarta y regresa al suministro cuando el portador recibe su primera herida.",
      "health pack (type i)": "Confiere la clave Soporte Vital (Life Support). Se descarta al activarse. También puede usarse como acción auxiliar para curar todo el daño sufrido.",
      "overshield (type ii)": "Un solo uso. Añade 1 punto de escudo de energía adicional hasta que se agote o consuma. Se pierde antes que los propios escudos.",
      "quantum translocator (type ii)": "Un solo uso. Actívalo antes de Avanzar o Correr dejando un token en el cubo de origen. Hasta el fin de la activación, si estás a 2 cubos o menos, regresa a ese cubo sin ataque de ruptura.",
      "shroud screen (type ii)": "Un solo uso. Despliega una pantalla de humo en tu cubo o adyacente en LdV. Bloquea LdV hacia, desde o a través de ese cubo hasta el final de la ronda.",
      "threat sensor (type ii)": "Un solo uso. Escoge un cubo objetivo: todos los aliados tienen LdV a ese cubo y adyacentes hasta el final de la ronda.",
      "thruster (type ii)": "Un solo uso. Añade +1 al Movimiento para una acción de AVANCE o SPRINT antes de realizarla.",
      "repair field": "Despliega un campo de reparación en el cubo del usuario hasta el final de la partida. Cada modelo en ese cubo al final de la ronda se cura 1 daño."
    };

    function applyCustomDataToRuntime() {
      if (!window.FLASHPOINT_DATA) window.FLASHPOINT_DATA = { units: [], wargame: { weapons: [], grenades: [], items: [], upgrades: [], orders: [] }, keywords: {} };
      if (!window.FLASHPOINT_DATA.keywords) window.FLASHPOINT_DATA.keywords = {};
      if (!window.FLASHPOINT_DATA.wargame) window.FLASHPOINT_DATA.wargame = { weapons: [], grenades: [], items: [], upgrades: [], orders: [] };

      // 1. Palabras clave oficiales v2.5 y personalizadas
      Object.assign(window.FLASHPOINT_DATA.keywords, OFFICIAL_KEYWORDS_V25, customData.keywords);

      // 2. Armas
      customData.weapons.forEach(w => {
        if (!window.FLASHPOINT_DATA.wargame.weapons.some(x => x.name === w.name && x.range === w.range)) {
          window.FLASHPOINT_DATA.wargame.weapons.push(w);
        }
      });

      // 3. Granadas
      customData.grenades.forEach(g => {
        if (!window.FLASHPOINT_DATA.wargame.grenades.some(x => x.name === g.name)) {
          window.FLASHPOINT_DATA.wargame.grenades.push(g);
        }
      });

      // 4. Objetos
      customData.items.forEach(it => {
        if (!window.FLASHPOINT_DATA.wargame.items.some(x => x.name === it.name)) {
          window.FLASHPOINT_DATA.wargame.items.push(it);
        }
      });

      // 5. Órdenes
      customData.orders.forEach(ord => {
        if (!window.FLASHPOINT_DATA.wargame.orders.some(x => x.name === ord.name && x.faction === ord.faction)) {
          window.FLASHPOINT_DATA.wargame.orders.push(ord);
        }
      });

      // 6. Unidades
      const baseUnits = (window.FLASHPOINT_DATA.units || []);
      const merged = [...baseUnits];
      customData.units.forEach(cu => {
        const idx = merged.findIndex(u => u.id === cu.id);
        if (idx >= 0) {
          merged[idx] = cu;
        } else {
          merged.push(cu);
        }
      });
      warscrollDatabase = merged;
    }

    // ==============================================================
    // GESTIÓN INTERACTIVA DE FOTOS, MODAL DE ACCIÓN Y RECORTE CON ZOOM
    // ==============================================================
    let currentPhotoModalUnitId = null;
    let pendingBarracksPhotoDataUrl = null;

    window.openPhotoActionModal = function(unitId, isCustomPhoto) {
      currentPhotoModalUnitId = unitId;
      const unit = warscrollDatabase.find(u => u.id === unitId) || {};
      const modal = document.getElementById('photoActionModal');
      const title = document.getElementById('photoActionTitle');
      const desc = document.getElementById('photoActionDesc');
      const btnReset = document.getElementById('btnPhotoActionReset');
      const btnChange = document.getElementById('btnPhotoActionChange');

      if (title) title.textContent = `📷 ${unit.name || 'OPERATIVO'}`;

      if (isCustomPhoto) {
        if (desc) desc.textContent = 'Este modelo tiene una foto de miniatura personalizada activa.';
        if (btnChange) btnChange.textContent = '📷 CAMBIAR FOTO / REENCUADRAR';
        if (btnReset) btnReset.style.display = 'inline-flex';
      } else {
        if (desc) desc.textContent = 'Actualmente se muestra la ilustración oficial. Puedes subir la foto de tu miniatura real pintada a mano para personalizar su tarjeta y dossier.';
        if (btnChange) btnChange.textContent = '📷 SUBIR FOTO DE TU MINIATURA';
        if (btnReset) btnReset.style.display = 'none';
      }

      if (modal) {
        modal.classList.add('active');
      }
    };

    window.closePhotoActionModal = function() {
      const modal = document.getElementById('photoActionModal');
      if (modal) modal.classList.remove('active');
      currentPhotoModalUnitId = null;
    };

    window.triggerPhotoUploadFromModal = function() {
      const uid = currentPhotoModalUnitId;
      closePhotoActionModal();
      if (uid) {
        promptPhotoUploadForUnit(uid);
      }
    };

    window.triggerPhotoResetFromModal = async function() {
      const uid = currentPhotoModalUnitId;
      closePhotoActionModal();
      if (uid) {
        await resetUnitPhoto(uid);
      }
    };

    window.promptPhotoUploadForUnit = function(unitId) {
      targetUnitIdForPhoto = unitId;
      const fileInput = document.getElementById('globalPhotoInput');
      if (fileInput) {
        fileInput.value = '';
        fileInput.click();
      }
    };

    window.resetUnitPhoto = async function(unitId) {
      if (confirm('¿Restaurar la ilustración oficial de este modelo? Se eliminará la foto de tu miniatura personalizada.')) {
        await deleteUnitPhotoFromDB(unitId);
        delete customPhotosCache[unitId];
        refreshUnitViews(unitId);
        renderPhotosGallery();
      }
    };

    function refreshUnitViews(unitId) {
      if (currentSelectedId === unitId) {
        const unit = warscrollDatabase.find(u => u.id === unitId);
        if (unit) renderDatacard(unit, currentTab);
      } else {
        const activeSquad = squads.find(s => s.id === activeSquadId);
        if (activeSquad) {
          const sqUnit = activeSquad.units.find(u => u.uniqueUid === currentSelectedId && u.id === unitId);
          if (sqUnit) renderDatacard(sqUnit, 'SQUAD');
        }
      }
    }

    // CROPPING / ENCUADRE CON ZOOM Y VISOR CIRCULAR
    let cropperState = {
      img: null,
      targetUnitId: null,
      isBarracksPending: false,
      zoom: 1,
      panX: 0,
      panY: 0,
      isDragging: false,
      startX: 0,
      startY: 0
    };

    function openImageCropper(file, targetUnitId, isBarracksPending) {
      if (!file || !file.type.match(/^image\//)) {
        alert('Por favor selecciona un archivo de imagen válido.');
        return;
      }
      const reader = new FileReader();
      reader.onload = (evt) => {
        const img = new Image();
        img.onload = () => {
          cropperState.img = img;
          cropperState.targetUnitId = targetUnitId;
          cropperState.isBarracksPending = isBarracksPending;
          cropperState.zoom = 1;
          cropperState.panX = 0;
          cropperState.panY = 0;
          cropperState.isDragging = false;

          const slider = document.getElementById('cropZoomSlider');
          if (slider) slider.value = 1;

          const modal = document.getElementById('imageCropperModal');
          if (modal) {
        modal.classList.add('active');
      }

          drawCropperCanvas();
        };
        img.onerror = () => alert('No se pudo abrir la imagen seleccionada.');
        img.src = evt.target.result;
      };
      reader.readAsDataURL(file);
    }

    function drawCropperCanvas() {
      const canvas = document.getElementById('cropCanvas');
      if (!canvas || !cropperState.img) return;
      const ctx = canvas.getContext('2d');
      const w = canvas.width;
      const h = canvas.height;
      const cx = w / 2;
      const cy = h / 2;
      const radius = 135;

      ctx.clearRect(0, 0, w, h);

      // 1. Imagen escalada y trasladada
      const img = cropperState.img;
      const minDim = Math.min(img.width, img.height);
      const baseScale = (radius * 2) / minDim;
      const currentScale = baseScale * cropperState.zoom;
      const drawW = img.width * currentScale;
      const drawH = img.height * currentScale;
      const drawX = cx - (drawW / 2) + cropperState.panX;
      const drawY = cy - (drawH / 2) + cropperState.panY;

      ctx.drawImage(img, drawX, drawY, drawW, drawH);

      // 2. Máscara de recorte exterior
      ctx.save();
      ctx.fillStyle = 'rgba(8, 15, 23, 0.78)';
      ctx.beginPath();
      ctx.rect(0, 0, w, h);
      ctx.arc(cx, cy, radius, 0, Math.PI * 2, true);
      ctx.fill();

      // 3. Anillo circular
      ctx.strokeStyle = '#00d2ff';
      ctx.lineWidth = 2.5;
      ctx.shadowColor = 'rgba(0, 210, 255, 0.7)';
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.stroke();

      // 4. Marcas guía de encuadre
      ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(0, 210, 255, 0.8)';
      ctx.lineWidth = 2;
      const tick = 10;
      ctx.beginPath(); ctx.moveTo(cx, cy - radius); ctx.lineTo(cx, cy - radius + tick); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx, cy + radius); ctx.lineTo(cx, cy + radius - tick); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx - radius, cy); ctx.lineTo(cx - radius + tick, cy); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx + radius, cy); ctx.lineTo(cx + radius - tick, cy); ctx.stroke();

      ctx.restore();
    }

    window.resetCropTransform = function() {
      cropperState.zoom = 1;
      cropperState.panX = 0;
      cropperState.panY = 0;
      const slider = document.getElementById('cropZoomSlider');
      if (slider) slider.value = 1;
      drawCropperCanvas();
    };

    window.closeCropperModal = function() {
      const modal = document.getElementById('imageCropperModal');
      if (modal) modal.classList.remove('active');
      cropperState.img = null;
    };

    window.applyCropAndSave = async function() {
      if (!cropperState.img) return;

      const exportCanvas = document.createElement('canvas');
      exportCanvas.width = 480;
      exportCanvas.height = 480;
      const eCtx = exportCanvas.getContext('2d');

      const radius = 135;
      const exportRadius = 240;
      const exportScale = exportRadius / radius;

      const img = cropperState.img;
      const minDim = Math.min(img.width, img.height);
      const baseScale = ((radius * 2) / minDim) * exportScale;
      const currentScale = baseScale * cropperState.zoom;
      const drawW = img.width * currentScale;
      const drawH = img.height * currentScale;
      const drawX = exportRadius - (drawW / 2) + (cropperState.panX * exportScale);
      const drawY = exportRadius - (drawH / 2) + (cropperState.panY * exportScale);

      eCtx.drawImage(img, drawX, drawY, drawW, drawH);
      const dataUrl = exportCanvas.toDataURL('image/jpeg', 0.88);

      if (cropperState.isBarracksPending) {
        pendingBarracksPhotoDataUrl = dataUrl;
        const thumb = document.getElementById('bmPhotoPreviewThumb');
        const stText = document.getElementById('bmPhotoStatusText');
        if (thumb) {
          thumb.src = dataUrl;
          thumb.style.display = 'inline-block';
        }
        if (stText) {
          stText.textContent = '✔ Foto encuadrada y lista para reclutar';
          stText.style.color = '#8df5a0';
        }
      } else if (cropperState.targetUnitId) {
        await saveUnitPhotoToDB(cropperState.targetUnitId, dataUrl);
        customPhotosCache[cropperState.targetUnitId] = dataUrl;
        refreshUnitViews(cropperState.targetUnitId);
        renderPhotosGallery();
      }

      closeCropperModal();
    };

    function initCropperEvents() {
      const canvas = document.getElementById('cropCanvas');
      const container = document.getElementById('cropContainer');
      const slider = document.getElementById('cropZoomSlider');
      if (!canvas) return;

      function pointerDown(x, y) {
        cropperState.isDragging = true;
        cropperState.startX = x - cropperState.panX;
        cropperState.startY = y - cropperState.panY;
        if (container) container.style.cursor = 'grabbing';
      }

      function pointerMove(x, y) {
        if (!cropperState.isDragging) return;
        cropperState.panX = x - cropperState.startX;
        cropperState.panY = y - cropperState.startY;
        drawCropperCanvas();
      }

      function pointerUp() {
        cropperState.isDragging = false;
        if (container) container.style.cursor = 'grab';
      }

      canvas.addEventListener('mousedown', (e) => { pointerDown(e.clientX, e.clientY); });
      window.addEventListener('mousemove', (e) => { if (cropperState.isDragging) pointerMove(e.clientX, e.clientY); });
      window.addEventListener('mouseup', () => { pointerUp(); });

      canvas.addEventListener('touchstart', (e) => {
        if (e.touches.length === 1) {
          pointerDown(e.touches[0].clientX, e.touches[0].clientY);
        }
      }, { passive: true });

      canvas.addEventListener('touchmove', (e) => {
        if (cropperState.isDragging && e.touches.length === 1) {
          pointerMove(e.touches[0].clientX, e.touches[0].clientY);
        }
      }, { passive: true });

      canvas.addEventListener('touchend', () => { pointerUp(); });

      canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        const delta = e.deltaY < 0 ? 0.12 : -0.12;
        cropperState.zoom = Math.max(1, Math.min(4, cropperState.zoom + delta));
        if (slider) slider.value = cropperState.zoom;
        drawCropperCanvas();
      }, { passive: false });

      if (slider) {
        slider.addEventListener('input', (e) => {
          cropperState.zoom = parseFloat(e.target.value) || 1;
          drawCropperCanvas();
        });
      }

      const pModal = document.getElementById('photoActionModal');
      if (pModal) {
        pModal.addEventListener('click', (e) => {
          if (e.target === pModal) closePhotoActionModal();
        });
      }

      const cModal = document.getElementById('imageCropperModal');
      if (cModal) {
        cModal.addEventListener('click', (e) => {
          if (e.target === cModal) closeCropperModal();
        });
      }
    }

    const globalPhotoInput = document.getElementById('globalPhotoInput');
    if (globalPhotoInput) {
      globalPhotoInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file || !targetUnitIdForPhoto) return;
        openImageCropper(file, targetUnitIdForPhoto, false);
      });
    }

    const bmPhotoInput = document.getElementById('bmPhotoInput');
    if (bmPhotoInput) {
      bmPhotoInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        openImageCropper(file, null, true);
      });
    }

    // MODAL DE BARRACONES Y ARMERÍA
    const armoryModal = document.getElementById('armoryModal');
    window.openArmoryModal = function(tabName = 'rules') {
      if (armoryModal) {
        armoryModal.classList.add('active');
        switchArmoryTab(tabName);
      }
    };

    window.closeArmoryModal = function() {
  if (armoryModal) armoryModal.classList.remove('active');
  if (document.body.classList.contains('spa-mode')) window.goHome();
};

    if (armoryModal) {
      armoryModal.addEventListener('click', (e) => {
        if (e.target === armoryModal) closeArmoryModal();
      });
    }

    window.switchArmoryTab = function(tabId) {
      const tabs = ['rules', 'weapons', 'barracks', 'photos', 'logistics'];
      tabs.forEach(t => {
        const tabBtn = document.getElementById('tabArmory' + t.charAt(0).toUpperCase() + t.slice(1));
        const panel = document.getElementById('panelArmory' + t.charAt(0).toUpperCase() + t.slice(1));
        if (tabBtn) tabBtn.classList.toggle('active', t === tabId);
        if (panel) panel.classList.toggle('active', t === tabId);
      });

      if (tabId === 'rules') renderArmoryRulesList();
      if (tabId === 'weapons') {
        updateArmoryEquipmentFormFields();
        populateArmoryWeaponTraits();
        renderArmoryWeaponsList();
      }
      if (tabId === 'barracks') {
        populateBarracksDropdowns();
        renderCustomBarracksUnitsList();
      }
      if (tabId === 'photos') renderPhotosGallery();
    };

    // PANEL 1: REGLAS
    function renderArmoryRulesList() {
      const listEl = document.getElementById('customRulesList');
      if (!listEl) return;
      const keys = Object.keys(customData.keywords || {});
      if (keys.length === 0) {
        listEl.innerHTML = '<div style="color:#7b96b3; font-size:0.85rem; padding:10px; text-align:center;">No tienes palabras clave personalizadas registradas todavía.</div>';
        return;
      }
      listEl.innerHTML = keys.map(k => {
        const desc = customData.keywords[k];
        return `
          <div class="armory-item-card">
            <div>
              <div class="armory-item-title">${k.toUpperCase()}</div>
              <div class="armory-item-desc">${desc}</div>
            </div>
            <button class="armory-btn-del" onclick="deleteCustomRule('${k}')">ELIMINAR</button>
          </div>
        `;
      }).join('');
    }

    window.addCustomRule = function() {
      const nameInput = document.getElementById('kwNameInput');
      const descInput = document.getElementById('kwDescInput');
      const name = nameInput.value.trim();
      const desc = descInput.value.trim();
      if (!name) { alert('Ingresa el nombre de la palabra clave.'); return; }
      if (!desc) { alert('Ingresa la descripción del efecto de la regla.'); return; }

      customData.keywords[name.toLowerCase()] = desc;
      saveCustomData();
      applyCustomDataToRuntime();
      nameInput.value = '';
      descInput.value = '';
      renderArmoryRulesList();
      populateArmoryWeaponTraits();
      alert(`Palabra clave "${name}" registrada correctamente.`);
    };

    window.deleteCustomRule = function(k) {
      if (confirm(`¿Eliminar la regla "${k.toUpperCase()}"?`)) {
        delete customData.keywords[k];
        if (window.FLASHPOINT_DATA && window.FLASHPOINT_DATA.keywords) {
          delete window.FLASHPOINT_DATA.keywords[k];
        }
        saveCustomData();
        renderArmoryRulesList();
        populateArmoryWeaponTraits();
      }
    };

    // PANEL 2: ARMERÍA
    window.updateArmoryEquipmentFormFields = function() {
      const type = document.getElementById('eqTypeInput').value;
      const gRange = document.getElementById('groupEqRange');
      const gAp = document.getElementById('groupEqAp');
      const gTraits = document.getElementById('groupEqTraits');
      const gEffect = document.getElementById('groupEqEffect');
      const gOrder = document.getElementById('groupEqOrderFields');

      if (type === 'ranged' || type === 'melee') {
        gRange.style.display = 'flex';
        gAp.style.display = 'flex';
        gTraits.style.display = 'flex';
        gEffect.style.display = 'none';
        gOrder.style.display = 'none';
        if (type === 'melee') {
          document.getElementById('eqRangeInput').value = 'CC';
        } else if (document.getElementById('eqRangeInput').value === 'CC') {
          document.getElementById('eqRangeInput').value = 'R4';
        }
      } else if (type === 'grenade') {
        gRange.style.display = 'flex';
        gAp.style.display = 'flex';
        gTraits.style.display = 'flex';
        gEffect.style.display = 'none';
        gOrder.style.display = 'none';
        document.getElementById('eqRangeInput').value = 'R3';
      } else if (type === 'item') {
        gRange.style.display = 'none';
        gAp.style.display = 'none';
        gTraits.style.display = 'flex';
        gEffect.style.display = 'flex';
        gOrder.style.display = 'none';
      } else if (type === 'order') {
        gRange.style.display = 'none';
        gAp.style.display = 'none';
        gTraits.style.display = 'none';
        gEffect.style.display = 'flex';
        gOrder.style.display = 'flex';
      }
    };

    function populateArmoryWeaponTraits() {
      const container = document.getElementById('eqKwChipsContainer');
      if (!container) return;
      const standardWeaponTraits = [
        'Optics', 'Rapid Fire', 'Continuous Fire', 'Lethal (1)', 'Lethal (2)',
        'Weight of Fire (1)', 'Weight of Fire (2)', 'Weight of Fire (3)',
        'Blast', 'EMP', 'ESD (1)', 'ESD (2)', 'Explosive',
        'Frag (3)', 'Frag (4)', 'Frag (5)', 'Frag (6)', 'Grenade',
        'Implosion (3)', 'Implosion (5)', 'Knockback', 'Lunge', 'Long',
        'One-Use', 'Two-Uses', 'Sticky', 'Sniper Scope',
        'Smash (1)', 'Smash (2)', 'Concussive', 'Incendiary (5)',
        'Support Weapon', 'Suppression', 'Firing Platform (1)', 'Firing Platform (2)'
      ];
      const customKw = Object.keys(customData.keywords || {}).map(k => k.charAt(0).toUpperCase() + k.slice(1));
      const combined = Array.from(new Set([...standardWeaponTraits, ...customKw])).sort((a,b) => a.localeCompare(b));

      const checkedVals = new Set(
        Array.from(container.querySelectorAll('input[name="eqKwCheck"]:checked')).map(cb => cb.value)
      );

      container.innerHTML = combined.map(trait => {
        const isChecked = checkedVals.has(trait) ? 'checked' : '';
        return `
          <label class="kw-chip-label">
            <input type="checkbox" name="eqKwCheck" value="${trait}" ${isChecked}>
            <span>${trait}</span>
          </label>
        `;
      }).join('');
    }

    window.addCustomEquipment = function() {
      const type = document.getElementById('eqTypeInput').value;
      const name = document.getElementById('eqNameInput').value.trim();
      const cost = parseInt(document.getElementById('eqCostInput').value, 10) || 0;
      const range = document.getElementById('eqRangeInput').value.trim() || '-';
      const ap = document.getElementById('eqApInput').value.trim() || '-';
      
      const checkedBoxes = Array.from(document.querySelectorAll('input[name="eqKwCheck"]:checked')).map(cb => cb.value);
      const traits = checkedBoxes.length > 0 ? checkedBoxes.join(', ') : '-';
      const effect = document.getElementById('eqEffectInput').value.trim() || '';

      if (!name) { alert('Ingresa un nombre para el equipamiento.'); return; }

      if (type === 'ranged' || type === 'melee') {
        customData.weapons.push({ name, cost, range, ap, traits, isCustom: true });
      } else if (type === 'grenade') {
        customData.grenades.push({ name, cost, range, ap, traits, isCustom: true });
      } else if (type === 'item') {
        customData.items.push({ name, cost, type: '2', keywords: traits, effect, isCustom: true });
      } else if (type === 'order') {
        const faction = document.getElementById('eqOrderFactionInput').value;
        const unit = document.getElementById('eqOrderUnitInput').value.trim() || faction;
        customData.orders.push({ faction, name, cost, unit, timing: 'Durante la activación.', effect, isCustom: true });
      }

      saveCustomData();
      applyCustomDataToRuntime();

      // Reset form
      document.getElementById('eqNameInput').value = '';
      document.getElementById('eqCostInput').value = '6';
      document.getElementById('eqRangeInput').value = (type === 'melee' ? 'CC' : (type === 'grenade' ? 'R3' : 'R4'));
      document.getElementById('eqApInput').value = '-';
      document.getElementById('eqEffectInput').value = '';
      document.querySelectorAll('input[name="eqKwCheck"]').forEach(cb => cb.checked = false);

      renderArmoryWeaponsList();
      alert(`Elemento "${name}" fabricado y registrado con éxito.`);
    };

    function renderArmoryWeaponsList() {
      const listEl = document.getElementById('customEquipmentList');
      if (!listEl) return;
      const allCustom = [];
      (customData.weapons || []).forEach(w => allCustom.push({ cat: 'Arma (' + w.range + ')', name: w.name, cost: w.cost, desc: `RA: ${w.range} | AP: ${w.ap} | KW: ${w.traits}`, type: 'weapon' }));
      (customData.grenades || []).forEach(g => allCustom.push({ cat: 'Granada', name: g.name, cost: g.cost, desc: `RA: ${g.range} | AP: ${g.ap} | KW: ${g.traits}`, type: 'grenade' }));
      (customData.items || []).forEach(it => allCustom.push({ cat: 'Objeto', name: it.name, cost: it.cost, desc: it.effect, type: 'item' }));
      (customData.orders || []).forEach(ord => allCustom.push({ cat: 'Orden (' + ord.faction + ')', name: ord.name, cost: ord.cost, desc: ord.effect, type: 'order' }));

      if (allCustom.length === 0) {
        listEl.innerHTML = '<div style="color:#7b96b3; font-size:0.85rem; padding:10px; text-align:center;">No tienes armas ni objetos personalizados todavía.</div>';
        return;
      }

      listEl.innerHTML = allCustom.map(item => `
        <div class="armory-item-card">
          <div>
            <div class="armory-item-title">[ ${item.cat} ] ${item.name} <span style="color:#8df5a0; font-size:0.85rem;">(${item.cost} PTS)</span></div>
            <div class="armory-item-desc">${item.desc}</div>
          </div>
          <button class="armory-btn-del" onclick="deleteCustomEquipment('${item.type}', '${item.name.replace(/'/g, "\\'")}')">ELIMINAR</button>
        </div>
      `).join('');
    }

    window.deleteCustomEquipment = function(type, name) {
      if (confirm(`¿Eliminar "${name}" del catálogo?`)) {
        if (type === 'weapon') customData.weapons = customData.weapons.filter(w => w.name !== name);
        if (type === 'grenade') customData.grenades = customData.grenades.filter(g => g.name !== name);
        if (type === 'item') customData.items = customData.items.filter(i => i.name !== name);
        if (type === 'order') customData.orders = customData.orders.filter(o => o.name !== name);

        if (window.FLASHPOINT_DATA && window.FLASHPOINT_DATA.wargame) {
          if (type === 'weapon') window.FLASHPOINT_DATA.wargame.weapons = window.FLASHPOINT_DATA.wargame.weapons.filter(w => !(w.isCustom && w.name === name));
          if (type === 'grenade') window.FLASHPOINT_DATA.wargame.grenades = window.FLASHPOINT_DATA.wargame.grenades.filter(g => !(g.isCustom && g.name === name));
          if (type === 'item') window.FLASHPOINT_DATA.wargame.items = window.FLASHPOINT_DATA.wargame.items.filter(i => !(i.isCustom && i.name === name));
          if (type === 'order') window.FLASHPOINT_DATA.wargame.orders = window.FLASHPOINT_DATA.wargame.orders.filter(o => !(o.isCustom && o.name === name));
        }

        saveCustomData();
        renderArmoryWeaponsList();
      }
    };

    // PANEL 3: BARRACONES
    window.toggleCustomFactionField = function() {
      const val = document.getElementById('bmUnitFaction').value;
      const grp = document.getElementById('groupCustomFaction');
      if (grp) grp.style.display = val === 'CUSTOM' ? 'flex' : 'none';
    };

    function populateBarracksDropdowns() {
      const selMelee = document.getElementById('bmSelMelee');
      const selPrimary = document.getElementById('bmSelPrimary');
      const selSecondary = document.getElementById('bmSelSecondary');
      const selGrenade = document.getElementById('bmSelGrenade');
      const kwContainer = document.getElementById('bmKwChipsContainer');

      const allWeapons = (window.FLASHPOINT_DATA && window.FLASHPOINT_DATA.wargame && window.FLASHPOINT_DATA.wargame.weapons) || [];
      const allGrenades = (window.FLASHPOINT_DATA && window.FLASHPOINT_DATA.wargame && window.FLASHPOINT_DATA.wargame.grenades) || [];

      // Melee
      const meleeMap = new Map();
      allWeapons.filter(w => w.range === 'CC' || w.range === 'R1').forEach(w => meleeMap.set(w.name, w));
      (window.FLASHPOINT_DATA.units || []).forEach(u => {
        (u.weapons || []).filter(w => w.range === 'CC').forEach(w => {
          if (!meleeMap.has(w.name)) meleeMap.set(w.name, { name: w.name, range: 'CC', ap: w.ap || '-', traits: w.traits || '-' });
        });
      });
      if (!meleeMap.has('Spartan Fists')) meleeMap.set('Spartan Fists', { name: 'Spartan Fists', range: 'CC', ap: '-', traits: '-' });
      if (!meleeMap.has('Sangheili Fists')) meleeMap.set('Sangheili Fists', { name: 'Sangheili Fists', range: 'CC', ap: '-', traits: 'Smash (1)' });

      if (selMelee) {
        selMelee.innerHTML = '';
        Array.from(meleeMap.values()).sort((a,b) => a.name.localeCompare(b.name)).forEach(w => {
          const opt = document.createElement('option');
          opt.value = w.name;
          opt.textContent = `${w.name} [${w.range} | AP ${w.ap || '-'}]`;
          if (w.name === 'Spartan Fists') opt.selected = true;
          selMelee.appendChild(opt);
        });
      }

      // Ranged Primary
      const rangedList = allWeapons.filter(w => w.range !== 'CC' && w.range !== 'R1').sort((a,b) => a.name.localeCompare(b.name));
      if (selPrimary) {
        selPrimary.innerHTML = '';
        rangedList.forEach(w => {
          const opt = document.createElement('option');
          opt.value = w.name;
          opt.textContent = `${w.name} [${w.range} | AP ${w.ap || '-'}]`;
          if (w.name.includes('MA40 Assault')) opt.selected = true;
          selPrimary.appendChild(opt);
        });
      }

      // Secondary
      if (selSecondary) {
        selSecondary.innerHTML = '<option value="">-- Ninguna (Ranura Vacía) --</option>';
        rangedList.forEach(w => {
          const opt = document.createElement('option');
          opt.value = w.name;
          opt.textContent = `${w.name} [${w.range} | AP ${w.ap || '-'}]`;
          selSecondary.appendChild(opt);
        });
      }

      // Grenades
      if (selGrenade) {
        selGrenade.innerHTML = '<option value="">-- Ninguna (Ranura Vacía) --</option>';
        allGrenades.forEach(g => {
          const opt = document.createElement('option');
          opt.value = g.name;
          opt.textContent = `${g.name} [${g.range} | AP ${g.ap || '-'}]`;
          selGrenade.appendChild(opt);
        });
      }

      // Keywords and Abilities chips (consolidated)
      if (kwContainer) {
        const dict = (window.FLASHPOINT_DATA && window.FLASHPOINT_DATA.keywords) || {};
        const allKeywords = Object.keys(dict).sort();
        kwContainer.innerHTML = allKeywords.map(k => {
          const label = k.charAt(0).toUpperCase() + k.slice(1);
          return `
            <label class="kw-chip-label">
              <input type="checkbox" name="bmKwCheck" value="${label}">
              <span>${label}</span>
            </label>
          `;
        }).join('');
      }
    }

    window.recruitCustomUnit = async function() {
      const name = document.getElementById('bmUnitName').value.trim();
      if (!name) { alert('Debes asignarle un nombre a tu operativo.'); return; }

      let faction = document.getElementById('bmUnitFaction').value;
      if (faction === 'CUSTOM') {
        faction = document.getElementById('bmCustomFaction').value.trim();
        if (!faction) faction = 'Personalizada';
      }

      const cost = String(parseInt(document.getElementById('bmUnitCost').value, 10) || 40);
      const move = document.getElementById('bmUnitMove').value.trim() || '2/3';
      const sht = document.getElementById('bmUnitSht').value;
      const fgt = document.getElementById('bmUnitFgt').value;
      const srv = document.getElementById('bmUnitSrv').value;
      const arm = document.getElementById('bmUnitArm').value;
      const hp = String(parseInt(document.getElementById('bmUnitHp').value, 10) || 4);
      const shield = document.getElementById('bmUnitShield').value;

      const selMeleeName = document.getElementById('bmSelMelee').value;
      const selPrimaryName = document.getElementById('bmSelPrimary').value;
      const selSecondaryName = document.getElementById('bmSelSecondary').value;
      const selGrenadeName = document.getElementById('bmSelGrenade').value;

      const weapons = [];
      const allW = (window.FLASHPOINT_DATA && window.FLASHPOINT_DATA.wargame && window.FLASHPOINT_DATA.wargame.weapons) || [];
      const allG = (window.FLASHPOINT_DATA && window.FLASHPOINT_DATA.wargame && window.FLASHPOINT_DATA.wargame.grenades) || [];

      // Melee
      let meleeObj = allW.find(w => w.name === selMeleeName && (w.range === 'CC' || w.range === 'R1'));
      if (!meleeObj) meleeObj = { name: selMeleeName, range: 'CC', ap: '-', traits: '-' };
      weapons.push({ name: meleeObj.name, range: meleeObj.range, ap: meleeObj.ap || '-', traits: meleeObj.traits || '-' });

      // Primary
      let primObj = allW.find(w => w.name === selPrimaryName);
      if (primObj) weapons.push({ name: primObj.name, range: primObj.range, ap: primObj.ap || '-', traits: primObj.traits || '-' });

      // Secondary
      if (selSecondaryName) {
        let secObj = allW.find(w => w.name === selSecondaryName);
        if (secObj) weapons.push({ name: secObj.name, range: secObj.range, ap: secObj.ap || '-', traits: secObj.traits || '-' });
      }

      // Grenade
      if (selGrenadeName) {
        let grnObj = allG.find(g => g.name === selGrenadeName);
        if (grnObj) weapons.push({ name: grnObj.name, range: grnObj.range, ap: grnObj.ap || '-', traits: grnObj.traits || '-' });
      }

      // Keywords & Abilities
      const checkedBoxes = Array.from(document.querySelectorAll('input[name="bmKwCheck"]:checked'));
      const kwList = checkedBoxes.map(b => b.value);
      const keywordsStr = kwList.length > 0 ? kwList.join(', ') : '-';

      const abilities = [];
      const specName = document.getElementById('bmSpecialName').value.trim();
      const specDesc = document.getElementById('bmSpecialDesc').value.trim();
      if (specName) {
        abilities.push({ name: specName, desc: specDesc || 'Regla o habilidad táctica especial.' });
      }

      kwList.forEach(k => {
        if (!abilities.some(a => a.name.toLowerCase() === k.toLowerCase())) {
          const desc = getKeywordExplanation(k) || (window.FLASHPOINT_DATA && window.FLASHPOINT_DATA.keywords && window.FLASHPOINT_DATA.keywords[k.toLowerCase()]) || 'Regla táctica del operativo.';
          abilities.push({ name: k, desc: desc });
        }
      });

      const newUnitId = 'custom-unit-' + Date.now();
      const newUnit = {
        id: newUnitId,
        isCustom: true,
        faction: faction,
        name: name,
        cost: cost,
        move: move,
        sht: sht,
        fgt: fgt,
        srv: srv,
        arm: arm,
        hp: hp,
        shield: shield,
        image: '',
        weapons: weapons,
        abilities: abilities,
        keywords: keywordsStr
      };

      if (pendingBarracksPhotoDataUrl) {
        await saveUnitPhotoToDB(newUnitId, pendingBarracksPhotoDataUrl);
        customPhotosCache[newUnitId] = pendingBarracksPhotoDataUrl;
        pendingBarracksPhotoDataUrl = null;
      } else {
        const photoFileInput = document.getElementById('bmPhotoInput');
        if (photoFileInput && photoFileInput.files && photoFileInput.files[0]) {
          try {
            const dataUrl = await compressAndResizeImage(photoFileInput.files[0]);
            await saveUnitPhotoToDB(newUnitId, dataUrl);
            customPhotosCache[newUnitId] = dataUrl;
          } catch (e) {
            console.warn('Foto no procesada:', e);
          }
        }
      }

      customData.units.push(newUnit);
      saveCustomData();
      applyCustomDataToRuntime();
      updateFactionDropdown();
      renderUnitList();
      renderCustomBarracksUnitsList();

      document.getElementById('bmUnitName').value = '';
      document.getElementById('bmSpecialName').value = '';
      document.getElementById('bmSpecialDesc').value = '';
      const photoFileInput = document.getElementById('bmPhotoInput');
      if (photoFileInput) photoFileInput.value = '';
      const thumb = document.getElementById('bmPhotoPreviewThumb');
      const stText = document.getElementById('bmPhotoStatusText');
      if (thumb) { thumb.src = ''; thumb.style.display = 'none'; }
      if (stText) { stText.textContent = '(Podrás encuadrar y hacer zoom a la miniatura al seleccionarla)'; stText.style.color = '#7b96b3'; }
      checkedBoxes.forEach(b => b.checked = false);

      closeArmoryModal();
      tabDB.click();
      renderDatacard(newUnit, 'DB');
      alert(`¡Operativo ${name} reclutado exitosamente!`);
    };

    function renderCustomBarracksUnitsList() {
      const listEl = document.getElementById('customBarracksUnitsList');
      if (!listEl) return;
      const list = customData.units || [];
      if (list.length === 0) {
        listEl.innerHTML = '<div style="color:#7b96b3; font-size:0.85rem; padding:10px; text-align:center;">No has creado ningún operativo personalizado todavía.</div>';
        return;
      }
      listEl.innerHTML = list.map(u => `
        <div class="armory-item-card">
          <div>
            <div class="armory-item-title">[ ${u.faction} ] ${u.name} <span style="color:#8df5a0; font-size:0.85rem;">(${u.cost} PTS)</span></div>
            <div class="armory-item-desc">MOV: ${u.move} | RA: ${u.sht} | FI: ${u.fgt} | SV: ${u.srv} | HP: ${u.hp} | SH: ${u.shield}</div>
          </div>
          <div style="display:flex; gap:6px;">
            <button class="armory-btn-submit" style="padding:4px 8px; font-size:0.75rem;" onclick="promptPhotoUploadForUnit('${u.id}')">📷 FOTO</button>
            <button class="armory-btn-del" onclick="deleteCustomUnit('${u.id}')">DAR DE BAJA</button>
          </div>
        </div>
      `).join('');
    }

    window.deleteCustomUnit = async function(unitId) {
      const found = (customData.units || []).find(u => u.id === unitId);
      const name = found ? found.name : 'este operativo';
      if (confirm(`¿Dar de baja a "${name}" permanentemente? Se eliminará de la base de datos y de todas tus escuadras.`)) {
        customData.units = (customData.units || []).filter(u => u.id !== unitId);
        saveCustomData();
        await deleteUnitPhotoFromDB(unitId);
        delete customPhotosCache[unitId];

        squads.forEach(sq => {
          sq.units = (sq.units || []).filter(u => u.id !== unitId);
        });
        saveSquads();

        applyCustomDataToRuntime();
        updateFactionDropdown();
        renderUnitList();
        renderSquadList();
        renderCustomBarracksUnitsList();
        if (currentSelectedId === unitId) {
          mainContainer.innerHTML = emptyStateHTML;
        }
      }
    };

    // PANEL 4: FOTOS DE MINIATURAS
    function renderPhotosGallery() {
      const grid = document.getElementById('photoGalleryGrid');
      if (!grid) return;
      const term = (document.getElementById('photoGallerySearch')?.value || '').trim().toLowerCase();

      const filtered = warscrollDatabase.filter(u => !term || u.name.toLowerCase().includes(term) || (u.faction || '').toLowerCase().includes(term));
      if (filtered.length === 0) {
        grid.innerHTML = '<div style="color:#7b96b3; grid-column:1/-1; text-align:center; padding:20px;">No se encontraron operativos coincidentes.</div>';
        return;
      }

      grid.innerHTML = filtered.map(u => {
        const customImg = customPhotosCache[u.id];
        const displayImg = customImg || u.image || '';
        const isCustom = !!customImg;
        return `
          <div class="mini-gallery-card">
            ${displayImg 
              ? `<img class="mini-gallery-img" src="${displayImg}" alt="${u.name}">` 
              : `<div class="mini-gallery-img" style="display:flex; align-items:center; justify-content:center; color:#425870; font-family:'Share Tech Mono'; font-size:0.8rem;">[ SIN FOTO ]</div>`
            }
            <div class="mini-gallery-info">
              <span class="mini-gallery-badge ${isCustom ? 'custom' : 'official'}">${isCustom ? '🎨 MINIATURA PINTADA' : '📷 OFICIAL'}</span>
              <div class="mini-gallery-name">${u.name}</div>
              <div style="font-size:0.75rem; color:#7b96b3; font-family:'Share Tech Mono';">${u.faction} · ${u.cost} PTS</div>
              <div class="mini-gallery-actions">
                <button class="btn-art-action" style="flex:1;" onclick="promptPhotoUploadForUnit('${u.id}')">📷 ${isCustom ? 'Cambiar' : 'Subir Foto'}</button>
                ${isCustom ? `<button class="btn-art-action reset" onclick="resetUnitPhoto('${u.id}')" title="Restaurar foto oficial"><span class="ui-icon icon-reroll"></span></button>` : ''}
              </div>
            </div>
          </div>
        `;
      }).join('');
    }

    // PANEL 5: LOGÍSTICA
    window.exportCustomBackupJSON = function() {
      const bundle = {
        app: "HaloFlashpointVisorBGG",
        version: "1.0",
        exportedAt: new Date().toISOString(),
        customData: customData,
        customPhotos: customPhotosCache
      };
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `halo-flashpoint-personalizaciones-${new Date().toISOString().slice(0,10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    };

    const jsonImportInput = document.getElementById('jsonImportInput');
    if (jsonImportInput) {
      jsonImportInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
          const text = await file.text();
          const bundle = JSON.parse(text);
          if (!bundle || (!bundle.customData && !bundle.customPhotos)) {
            throw new Error('El archivo no contiene un respaldo válido de la app.');
          }

          if (bundle.customData) {
            if (bundle.customData.keywords) Object.assign(customData.keywords, bundle.customData.keywords);
            if (Array.isArray(bundle.customData.weapons)) {
              bundle.customData.weapons.forEach(w => {
                if (!customData.weapons.some(x => x.name === w.name && x.range === w.range)) customData.weapons.push(w);
              });
            }
            if (Array.isArray(bundle.customData.grenades)) {
              bundle.customData.grenades.forEach(g => {
                if (!customData.grenades.some(x => x.name === g.name)) customData.grenades.push(g);
              });
            }
            if (Array.isArray(bundle.customData.items)) {
              bundle.customData.items.forEach(it => {
                if (!customData.items.some(x => x.name === it.name)) customData.items.push(it);
              });
            }
            if (Array.isArray(bundle.customData.orders)) {
              bundle.customData.orders.forEach(o => {
                if (!customData.orders.some(x => x.name === o.name && x.faction === o.faction)) customData.orders.push(o);
              });
            }
            if (Array.isArray(bundle.customData.units)) {
              bundle.customData.units.forEach(u => {
                if (!customData.units.some(x => x.id === u.id)) customData.units.push(u);
              });
            }
            saveCustomData();
          }

          if (bundle.customPhotos && typeof bundle.customPhotos === 'object') {
            for (const [unitId, dataUrl] of Object.entries(bundle.customPhotos)) {
              if (dataUrl) {
                await saveUnitPhotoToDB(unitId, dataUrl);
                customPhotosCache[unitId] = dataUrl;
              }
            }
          }

          applyCustomDataToRuntime();
          updateFactionDropdown();
          renderUnitList();
          renderSquadList();
          alert('¡Personalizaciones y fotos importadas exitosamente!');
          closeArmoryModal();
        } catch (err) {
          alert('Error al importar el archivo: ' + err.message);
        }
      });
    }

    window.resetToFactorySettings = async function() {
      if (confirm('¿ATENCIÓN: Estás a punto de borrar TODAS tus reglas, armas, operativos personalizados y fotos de miniaturas. ¿Deseas continuar?')) {
        localStorage.removeItem(CUSTOM_DATA_KEY);
        customData = { keywords: {}, weapons: [], grenades: [], items: [], orders: [], units: [] };
        
        try {
          const db = await getIDB();
          const tx = db.transaction('unitPhotos', 'readwrite');
          tx.objectStore('unitPhotos').clear();
        } catch (e) {
          console.warn('Error limpiando IndexedDB:', e);
        }
        customPhotosCache = {};

        applyCustomDataToRuntime();
        updateFactionDropdown();
        renderUnitList();
        renderSquadList();
        closeArmoryModal();
        mainContainer.innerHTML = emptyStateHTML;
        alert('Se han restablecido los datos originales de fábrica.');
      }
    };

    // CARGA DE DATOS PRECONFIGURADOS Y PERSONALIZADOS (OFFLINE)
    async function loadInitialData() {
      loadCustomData();
      try {
        customPhotosCache = await loadAllCustomPhotos();
      } catch (e) {
        console.warn('No se pudieron precargar fotos de IndexedDB:', e);
      }
      applyCustomDataToRuntime();
      populateArmoryWeaponTraits();
      populateBarracksDropdowns();
      initCropperEvents();
      updateFactionDropdown();
      renderUnitList();

      // Inicializar vista activa
      let activeSquadObj = squads.find(s => s.id === activeSquadId);
      if(activeSquadObj && activeSquadObj.units.length > 0) {
        renderSquadSelector();
        tabSquad.click();
      } else {
        renderSquadSelector();
        if (warscrollDatabase.length > 0) {
          tabDB.click();
        }
      }
    }

    // MODAL DE COMPENDIO OFICIAL Y GLOSARIO
    const compendiumModal = document.getElementById('compendiumModal');

    window.openCompendiumModal = function(tabName = 'glossary') {
      if (compendiumModal) {
        compendiumModal.classList.add('active');
        switchCompendiumTab(tabName);
      }
    };

    window.closeCompendiumModal = function() {
  if (compendiumModal) compendiumModal.classList.remove('active');
  if (document.body.classList.contains('spa-mode')) window.goHome();
};

    if (compendiumModal) {
      compendiumModal.addEventListener('click', (e) => {
        if (e.target === compendiumModal) closeCompendiumModal();
      });
    }

    window.switchCompendiumTab = function(tabId) {
      const tabs = ['glossary', 'core', 'actions', 'items', 'advanced', 'credits'];
      tabs.forEach(t => {
        const tabBtn = document.getElementById('tabCompendium' + t.charAt(0).toUpperCase() + t.slice(1));
        const panel = document.getElementById('panelCompendium' + t.charAt(0).toUpperCase() + t.slice(1));
        if (tabBtn) tabBtn.classList.toggle('active', t === tabId);
        if (panel) panel.classList.toggle('active', t === tabId);
      });
    };

    window.filterCompendiumAbilities = function() {
      const input = document.getElementById('compendiumSearchInput');
      const countEl = document.getElementById('compendiumSearchCount');
      if (!input) return;
      const query = input.value.toLowerCase().trim();
      const cards = document.querySelectorAll('#compendiumAbilityGrid .compendium-card');
      let visible = 0;
      cards.forEach(card => {
        const text = card.textContent.toLowerCase();
        const matches = text.includes(query);
        card.style.display = matches ? 'flex' : 'none';
        if (matches) visible++;
      });
      if (countEl) {
        countEl.textContent = `${visible} Habilidad${visible !== 1 ? 'es' : ''}`;
      }
    };

    // CIERRE UNIVERSAL CON TECLA ESCAPE
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const activeModals = document.querySelectorAll('.modal-overlay.active');
        activeModals.forEach(m => m.classList.remove('active'));
      }
    });

    // REGISTRO DE SERVICE WORKER PARA PWA
    // (Movido al index.html para PWABuilder)

    // STARTUP
    loadInitialData();





// --- SPA ROUTING (FASE 1) ---
window.navigateTo = function(viewId, subTab) {
  document.querySelectorAll('.app-view, .modal-overlay').forEach(function(el) {
    el.classList.remove('active');
  });
  const target = document.getElementById(viewId);
  if (target) {
    target.classList.add('active');
    if (viewId === 'view-database') {
      document.body.classList.remove('spa-mode');
      target.classList.remove('show-card-mobile');
      if (subTab === 'db') document.getElementById('tabDB').click();
      if (subTab === 'squads') document.getElementById('tabSquad').click();
    } else {
      document.body.classList.add('spa-mode');
    }
  }
};

window.goHome = function() {
  document.querySelectorAll('.app-view, .modal-overlay').forEach(function(el) {
    el.classList.remove('active');
  });
  document.getElementById('view-home').classList.add('active');
  document.body.classList.add('spa-mode');
  const vdb = document.getElementById('view-database');
  if (vdb) vdb.classList.remove('show-card-mobile');
};



window.closeCardMobile = function() {
  const vdb = document.getElementById('view-database');
  if (vdb) vdb.classList.remove('show-card-mobile');
};




