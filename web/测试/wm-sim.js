/* 高保真 WM 拍卖创建页仿真器 */
(function () {
  'use strict';

  /* ── 词条库（英文站文案，正负两槽共用同一份） ── */
  const STATS = [
    'Critical Damage', 'Critical Chance', 'Attack Speed', 'Damage to Corpus',
    'Damage to Grineer', 'Damage to Infested', 'Melee Damage', 'Melee Critical Chance',
    'Melee Critical Damage', 'Weapon Damage', 'Riven Kickback', 'Fire Rate',
    'Projectile Speed', 'Impact Damage', 'Slash Damage', 'Puncture Damage',
    'Heat Damage', 'Cold Damage', 'Electricity Damage', 'Void Damage',
    'True Steel Damage', 'Combo Duration', 'Extra Critical Chance', 'Trigger Time',
    'Reload Speed', 'Magazine Capacity', 'Multishot', 'Status Chance',
    'Status Duration', 'Status Resistance', 'Shield Damage', 'Zenurik Discount',
    'Damage to Piloting', 'Damage to Exalted', 'Heavy Slam', 'Bricked Shield',
    'Piercing Damage', 'Crushing Damage', 'Initial Ricochet', 'Flinch',
    'Recoil', 'Ammo Maximum', 'Aiming Speed', 'Range', 'Zoom',
    'Damage to Overheat', 'Bane of Corrupted', 'Bane of Grineer', 'Bane of Infested',
    'Bane of Kuva', 'Sniper Damage', 'Bow Damage', 'Finisher', 'Archwing Damage',
    'Parkour Efficiency', 'Airborne Damage', 'Sixer Duration', 'K-Destruction',
    'Water Parkour', 'Catapult', 'Jump Height', 'Slide Distance', 'Overshoot',
    'Wall Jump', 'Wall Climb', 'Cloak', 'Cloak Duration', 'Energy Duration',
    'Channeling Damage', 'Energy Drain', 'Regeneration', 'Hammer Rewind',
    'Sprint Speed', 'Boost Speed', 'Awareness', 'Instant Action',
    'Pickup Radius', 'Movement Speed', 'Execution Damage', 'Riven Damage',
    'Damage', 'Fire Rate', 'Ammo Maximum', 'Terminal Velocity', 'Vault Speed',
    'Punch Through', 'Guard Break', 'Enemy Shield Damage', 'Enemy Armor Damage',
    'Damage to Bosses', 'Boss Damage', 'Elite Damage', 'Exalted Damage',
    /* 负面条目（真机负面槽的占位符是 "No negative" */
    'No Critical Chance', 'No Critical Damage', 'Reduced Fire Rate',
    'Reduced Magazine Capacity', 'Reduced Multishot', 'Reduced Reload Speed',
    'Reduced Melee Damage', 'Reduced Projectile Speed', 'Reduced Range',
    'Reduced Damage to Piloting', 'Reduced Melee Critical Damage',
    'Reduced Impact Damage', 'Reduced Status Chance', 'Reduced Status Duration',
    'Reduced Zoom', 'Reduced Sprint Speed', 'Reduced Slash Damage',
    'Reduced Puncture Damage', 'Reduced Heat Damage', 'Reduced Cold Damage',
    'Reduced Electricity Damage', 'Reduced Void Damage', 'Reduced True Steel Damage',
    'Reduced Damage to Overheat', 'Slower Fire Rate', 'Slower Projectile Speed',
    'Slower Melee Speed', 'Reduced Recoil', 'Reduced Flinch',
    'Reduced Parkour Efficiency', 'Reduced Wall Climb', 'Reduced Air Damage',
    'Reduced Kickback', 'Reduced Charged Attack', 'Reduced Combo Duration',
    'Reduced Pierce', 'Reduced Crush', 'Reduced Slash', 'Reduced Puncture'
  ];
  const UNIQ = [...new Set(STATS)];

  const WEAPONS = [
    'Pura-manticon', 'Cassowar', 'Vinquibus', 'Vinquibus (Melee)', 'Euphona Prime',
    'Amanata', 'Amanata Prime', 'Soma', 'Rhino Prime', 'Gara Prime',
    'Chattercast', 'Sarin', 'Sevagun', 'Trumna Prime', 'Furis Prime',
    'Mesa Prime', 'Syndroma', 'Araxys', 'Arclight', 'Quizen Prime'
  ];

  /* 派系伤害 倍率框 */
  const FACTION = /Damage to (Corpus|Grineer|Infested|Piloting|Exalted)|Bane of (Corrupted|Grineer|Infested|Kuva)/i;

  /* 区间语义 */
  function numRange(kind, name) {
    const isFaction = FACTION.test(name);
    if (kind === 'neg') {
      return isFaction
        ? { min: '0', max: '1', step: '0.1', mult: true }
        : { min: '-400', max: '0', step: '1', mult: false };
    }
    return isFaction
      ? { min: '1', max: '4', step: '0.1', mult: true }
      : { min: '0', max: '400', step: '1', mult: false };
  }

  const $ = (s, r) => (r || document).querySelector(s);

  function el(tag, attrs, kids) {
    const n = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      if (k === 'class') n.className = attrs[k];
      else if (k === 'text') n.textContent = attrs[k];
      else if (k === 'html') n.innerHTML = attrs[k];
      else n.setAttribute(k, attrs[k]);
    }
    if (kids) kids.forEach(c => n.appendChild(c));
    return n;
  }

  /* ── 状态 ── */
  const state = {
    weapon: '', rows: [], preview: [], addClicks: 0, pickCounts: {}
  };
  window.__WM_STATE__ = state;

  /* ── 预览面板 ── */
  const previewUl = el('ul', { class: 'riven-preview__attributes' });
  const previewBox = el('div', { class: 'riven-preview' }, [previewUl]);

  function renderPreview() {
    previewUl.innerHTML = '';
    state.preview.forEach(p => {
      previewUl.appendChild(el('li', {}, [
        el('b', { text: p.val == null ? '' : p.val }),
        el('span', { text: p.name })
      ]));
    });
    refreshModName();          /* 卡名跟着登记表一起变，和真机一样 */
  }
  /* WM 登记一条属性。 */
  function register(name, val) {
    state.preview.push({ name: name, val: val });
    renderPreview();
  }
  function unregister(name) {
    const n = state.preview.length;
    state.preview = state.preview.filter(p => p.name !== name);
    return state.preview.length !== n;
  }

  /* ── 「裂罅Mod名称」——WM 按「武器 + 词条组合」自己算出来的卡名（只读控件） */
  let modNameForce = null;
  const modNameSel = el('select', { id: 'auctions-create__modName' });
  window.__WM_SIM_SET_MODNAME__ = list => { modNameForce = list ? list.slice() : null; refreshModName(); };

  function modNameCandidates() {
    const pv = state.preview;
    if (!pv.length) return [];
    if (pv.some(p => !p.val)) return [];          /* 有值没落地 WM 不会生成卡名 */
    const base = String(state.weapon || 'Riven').split('-')[0];
    const tag = pv.map(p => p.name.replace(/^(Reduced|No)\s+/i, '')
        .split(' ').map(w => w.slice(0, 3)).join('').slice(0, 5)).join('');
    return [base + ' ' + (tag || 'Cron') + '-itis'];
  }
  function refreshModName() {
    const list = modNameForce || modNameCandidates();
    modNameSel.innerHTML = '';
    modNameSel.appendChild(el('option', { value: '', text: '' }));
    list.forEach(n => modNameSel.appendChild(el('option', { value: n, text: n })));
    state.modName = list.slice();
  }

  /* 预览里的数值格式：+121.37% / -103.60% / x1.56 / 空 */
  function fmtVal(v, mult) {
    if (v == null || v === '') return '';
    const f = parseFloat(v);
    if (!isFinite(f)) return '';
    if (mult) return 'x' + f.toFixed(2);
    return (f >= 0 ? '+' : '-') + Math.abs(f).toFixed(2) + '%';
  }

  /* ── seeker ── */
  function makeSeeker(kind, list) {
    const sk = el('div', { class: 'seeker--H546a' });
    const input = el('input', { type: 'text', placeholder: '...' });
    const section = el('section', { class: 'input--nEyTr' }, [
      el('span', { class: 'real-input--rx3J_' }, [input]),
      el('div', { class: 'suggestion--TmAG6' }, [
        el('span', { class: 'invisible--LAvXr' }), el('span')
      ])
    ]);
    const btn = el('button', { class: 'btn action-button--wIg6B', type: 'button', tabindex: '0' });
    btn.innerHTML = '<svg class="wfm-icon icon-chevron-down"><use xlink:href="#icon-chevron-down"></use></svg>';
    sk.appendChild(section); sk.appendChild(btn);

    const dropdown = el('section', { class: 'dropdown--l05xz' });
    dropdown.style.display = 'none';
    const ul = el('ul');
    dropdown.appendChild(ul);
    sk.appendChild(dropdown);

    const row = { sk, input, btn, dropdown, ul, kind, stat: null };

    const openDD = () => {
      sk.classList.add('focused--QvkMD');
      dropdown.style.display = '';
      renderEntries(row, input.value);
    };
    const closeDD = () => {
      sk.classList.remove('focused--QvkMD');
      dropdown.style.display = 'none';
    };
    row.openDD = openDD; row.closeDD = closeDD;

    sk.addEventListener('focusin', () => openDD());
    sk.addEventListener('pointerdown', e => {
      if (e.target.closest('li')) return;
      if (sk.classList.contains('focused--QvkMD')) { closeDD(); return; }
      openDD();
    });
    sk.addEventListener('mousedown', e => {
      if (e.target.closest('li')) return;
      if (!sk.classList.contains('focused--QvkMD')) openDD();
    });
    input.addEventListener('input', () => {
      if (!sk.classList.contains('focused--QvkMD')) openDD();
      renderEntries(row, input.value);
    });
    input.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown') { e.preventDefault(); openDD(); }
      if (e.key === 'Enter') {
        const first = ul.querySelector('li.entry');
        if (first) { e.preventDefault(); first.click(); }
      }
    });

    /* 清除键：未选中 = chevron，选中后 = backspace（clear-all） */
    const clearBtn = el('button', { class: 'btn action-button--wIg6B clear-all--RBoy4', type: 'button', tabindex: '0' });
    clearBtn.innerHTML = '<svg class="wfm-icon icon-backspace"><use xlink:href="#icon-backspace"></use></svg>';
    clearBtn.style.display = 'none';
    clearBtn.addEventListener('click', e => {
      e.stopPropagation();
      const old = row.stat;
      sk.classList.remove('selectedPositive--SfzUS', 'selectedNegative--JpbBh');
      input.value = '';
      row.stat = null;
      clearBtn.style.display = 'none';
      btn.style.display = '';
      if (old) unregister(old);
      closeDD();
    });
    sk.appendChild(clearBtn);
    row.clearBtn = clearBtn;

    row.list = list;
    return row;
  }

  /* 下拉选项：中文名 + 英文名两个 span（真机就是这样） */
  function renderEntries(row, q) {
    const list = row.list || UNIQ;
    const ql = String(q || '').trim().toLowerCase();
    const hits = ql ? list.filter(s => s.toLowerCase().indexOf(ql) >= 0) : list.slice(0, 80);
    row.ul.innerHTML = '';
    if (!hits.length) {
      row.ul.appendChild(el('li', { class: 'empty--z7wlE', text: 'Nothing found' }));
      return;
    }
    hits.forEach(name => {
      const li = el('li', { class: 'entry--Rtw_c' });
      li.dataset.name = name;
      li.appendChild(el('span', { text: name }));
      li.appendChild(el('span', { text: name }));
      li.addEventListener('click', e => {
        e.stopPropagation();
        /* 武器名不进属性登记表（真机 riven-preview__attributes 只放词条） */
        if (row.kind === 'weapon') { chooseWeapon(row, name); return; }
        chooseStat(row, name);
      });
      row.ul.appendChild(li);
    });
  }

  /* 武器选中：只填名字，不登记属性 */
  function chooseWeapon(row, name) {
    row.stat = name;
    row.input.value = name;
    state.weapon = name;
    row.sk.classList.add('selectedPositive--SfzUS');
    row.btn.style.display = 'none';
    row.clearBtn.style.display = '';
    row.closeDD();
  }

  /* 选词条 —— 关键：WM 选中新词条不会撤销旧的登记 */
  function chooseStat(row, name) {
    const key = row.kind + ':' + name;
    state.pickCounts[key] = (state.pickCounts[key] || 0) + 1;

    row.stat = name;
    row.input.value = name;
    row.sk.classList.add(row.kind === 'neg' ? 'selectedNegative--JpbBh' : 'selectedPositive--SfzUS');
    row.btn.style.display = 'none';
    row.clearBtn.style.display = '';
    row.closeDD();

    /* WM 登记一条（不撤销旧的） */
    register(name, null);

    /* WM 选词条后重画该行 —— 数值框区间随词条变，节点被替换 */
    const rg = numRange(row.kind, name);
    row.isFaction = rg.mult;
    const oldNum = row.num;
    const nv = el('input', {
      type: 'number', step: rg.step, min: rg.min, max: rg.max,
      id: oldNum ? oldNum.id : '', placeholder: '0.00', value: oldNum ? oldNum.value : ''
    });
    if (oldNum && oldNum.parentNode) {
      oldNum.parentNode.replaceChild(nv, oldNum);
    }
    row.num = nv;

    if (row.numWrap) {
      const suffix = row.numWrap.querySelector('.input-group-append--ionLN');
      let prefix = row.numWrap.querySelector('.input-group-prepend--I8ydB');
      if (rg.mult) {
        if (suffix) suffix.textContent = '';
        if (!prefix) {
          prefix = el('div', { class: 'input-group-block--Yo42y input-group-prepend--I8ydB', text: 'x' });
          row.numWrap.insertBefore(prefix, row.numWrap.firstChild);
        }
      } else {
        if (prefix) prefix.remove();
        if (suffix) suffix.textContent = '%';
      }
    }

    /* 数值变化 更新预览面板里第一条同名记录。 */
    const sync = () => {
      const rec = state.preview.filter(p => p.name === name)[0];
      if (!rec) return;
      /* 真机不因越界而清空 —— 36.97 写进 0~1 的框照样显示成 x36.97。 */
      rec.val = fmtVal(nv.value, rg.mult);
      renderPreview();
    };
    nv.addEventListener('input', sync);
    nv.addEventListener('change', sync);
  }

  function makeRow(kind, withLabel, removable) {
    const row = makeSeeker(kind, UNIQ);
    const col8 = el('div', { class: 'd-flex flex-column align-items-stretch col-8 col-sm-8' });
    if (withLabel) {
      col8.appendChild(el('label', {
        for: 'auction-create__stats_' + state.rows.length,
        class: kind === 'neg' ? 'negative_label' : 'positive_label',
        text: kind === 'neg' ? 'Negative attribute' : 'Positive attributes'
      }));
    }
    col8.appendChild(row.sk);

    const col4 = el('div', { class: 'd-flex flex-column align-items-stretch col-4 col-sm-4' });
    const vid = 'auction-create__value_' + state.rows.length;
    col4.appendChild(el('label', { for: vid, class: kind === 'neg' ? 'negative_label' : 'positive_label', text: 'Value' }));
    const num = el('input', { type: 'number', step: '1', min: '0', max: '400', id: vid, placeholder: '0.00', value: '' });
    const numWrap = el('div', { class: 'input-group--iK7Vq my-auto' }, [
      el('div', { class: 'form-control--uQav7 form-input--yMF_l' }, [num]),
      el('div', { class: 'input-group-block--Yo42y input-group-append--ionLN', html: kind === 'neg' ? '&nbsp;&nbsp;&nbsp;' : '%' })
    ]);
    col4.appendChild(numWrap);
    row.num = num; row.numWrap = numWrap;

    const div = el('div', { class: 'form-group--Rtw_c auction-create__stats row compact' }, [col8, col4]);
    row.div = div;

    /* 「+ Add」加出来的行右侧带一个删除按钮（真机有） */
    if (removable && !window.__WM_SIM_NO_DEL__) {
      const del = el('button', { class: 'btn action-button--wIg6B remove-row--x9KqP', type: 'button', tabindex: '0' });
      del.innerHTML = '<svg class="wfm-icon icon-trash"></svg>';
      del.addEventListener('click', () => {
        const i = state.rows.indexOf(row);
        if (i >= 0) state.rows.splice(i, 1);
        if (div.parentNode) div.parentNode.removeChild(div);
        state.removed = (state.removed || 0) + 1;
      });
      div.appendChild(el('div', { class: 'col-auto' }, [del]));
      row.del = del;
    }
    return row;
  }

  /* ── 组装页面 ── */
  const form = el('form', { class: 'auction-create' });

  const wLabel = el('label', { for: 'auction-create__itemName', text: 'Weapon Name' });
  const wSk = makeSeeker('weapon', WEAPONS);
  form.appendChild(el('div', { class: 'form-group--Rtw_c' }, [
    wLabel,
    el('div', { class: 'd-flex flex-column align-items-stretch col-8 col-sm-8' }, [wSk.sk])
  ]));
  /* 武器选中不登记属性（真机武器名不进 riven-preview__attributes） */
  state.weaponRow = wSk;

  /* 词条行：2 正面 + 「+ Add」+ 1 负面（真机初始态） */
  const r0 = makeRow('pos', true);  state.rows.push(r0); form.appendChild(r0.div);
  const r1 = makeRow('pos', false); state.rows.push(r1); form.appendChild(r1.div);

  /* 「+ Add」按钮 —— 所在 div 也带 auction-create__stats row compact class */
  const addDiv = el('div', { class: 'form-group--Rtw_c auction-create__stats row compact' });
  const addBtn = el('button', { class: 'btn btn__light--c9XBJ', tabindex: '0', type: 'button' },
    [el('div', {}, [el('span', { text: '+ Add' })])]);
  addBtn.addEventListener('click', () => {
    state.addClicks++;
    const posCount = state.rows.filter(r => r.kind === 'pos').length;
    const nr = makeRow('pos', false, true);
    state.rows.splice(posCount, 0, nr);
    const anchor = [...form.querySelectorAll('div.auction-create__stats')].find(d => d.contains(addBtn));
    if (anchor) anchor.parentNode.insertBefore(nr.div, anchor);
    else form.appendChild(nr.div);
  });
  addDiv.appendChild(el('div', { class: 'col-auto' }, [addBtn]));
  form.appendChild(addDiv);

  const r2 = makeRow('neg', true); state.rows.push(r2); form.appendChild(r2.div);

  /* 尾部：段位 / 等级 / 循环次数 */
  const tail = el('div', { class: 'form-group--Rtw_c' });
  [['auction-create__masteryRank', 'Mastery Rank', '7', '16'],
   ['auction-create__modRank', 'Rank', '0', '8'],
   ['auction-create__reRolls', 'Re-rolls', '0', '500']].forEach(([id, lb, mn, mx]) => {
    tail.appendChild(el('div', { class: 'form-group--Rtw_c' }, [
      el('label', { for: id, text: lb }),
      el('input', { type: 'number', id: id, min: mn, max: mx, value: '' })
    ]));
  });
  form.appendChild(tail);

  /* 极性 */
  form.appendChild(el('div', { class: 'form-group--Rtw_c' }, [
    el('label', { for: 'auction-create__polarity', text: 'Polarity' }),
    (() => {
      const s = el('select', { id: 'auction-create__polarity' });
      ['Madurai', 'Vazarin', 'Naramon', 'Zenurik', 'Umbra', 'Penjaga', 'Sundial']
        .forEach(o => s.appendChild(el('option', { value: o, text: o })));
      return s;
    })()
  ]));

  /* 裂罅Mod名称（只读 —— 填表脚本只许看，不许写） */
  form.appendChild(el('div', { class: 'form-group--Rtw_c' }, [
    el('label', { for: 'auctions-create__modName', text: '裂罅Mod名称' }),
    modNameSel
  ]));
  refreshModName();

  /* 测试用钩子：点一次「+ Add」/ 预置 N 条空行 */
  window.__WM_SIM_ADD__ = n => { for (let i = 0; i < (n || 1); i++) addBtn.click(); };

  document.body.appendChild(form);
  document.body.appendChild(previewBox);

  window.__WM_SIM_READY__ = true;
})();
