import { CONFIG, saveConfig, resetConfig } from '../config.js';

export default class MenuScene extends Phaser.Scene {
    constructor() {
        super('MenuScene');
    }

    create() {
        const centerX = this.cameras.main.width / 2;

        this.add.text(centerX, 100, 'SNAIL HACKER', {
            fontSize: '64px',
            fontFamily: 'monospace',
            color: '#00ffcc',
        }).setOrigin(0.5);

        this.add.text(centerX, 185, 'A co-op arcade survival game', {
            fontSize: '20px',
            fontFamily: 'monospace',
            color: '#aaaaaa',
        }).setOrigin(0.5);

        // Divider
        const divider = this.add.graphics();
        divider.lineStyle(1, 0x224444, 0.8);
        divider.lineBetween(120, 218, 1160, 218);

        // Two-column controls summary
        // Left column: x=120, width=480  |  Right column: x=680, width=480
        const colStyle = (color) => ({
            fontSize: '15px',
            fontFamily: 'monospace',
            color,
            lineSpacing: 8,
            wordWrap: { width: 480, useAdvancedWrap: false },
        });

        this.add.text(120, 240, 'PLAYER 1 — THE SNAIL', {
            fontSize: '15px', fontFamily: 'monospace',
            color: '#ffdd44', fontStyle: 'bold',
        });
        this.add.text(120, 264, [
            'WASD          Move Gerald',
            'E (terminal)  Activate hack / minigame',
            'E (station)   Start hacking the station',
            'ESC           Cancel hack / pause',
        ].join('\n'), colStyle('#ccbb66'));

        this.add.text(680, 240, 'PLAYER 2 — THE SHOOTER', {
            fontSize: '15px', fontFamily: 'monospace',
            color: '#44ddff', fontStyle: 'bold',
        });
        this.add.text(680, 264, [
            'Left click     Fire toward cursor',
            'Left click     Grab snail / battery',
            '  (on target)  (cancels active hack)',
            'Right drag     Teleport snail to cursor',
        ].join('\n'), colStyle('#66bbcc'));

        // Objective blurb
        this.add.graphics()
            .lineStyle(1, 0x224444, 0.8)
            .lineBetween(120, 390, 1160, 390);

        this.add.text(centerX, 410, [
            'Survive 10 waves of alien invaders.',
            'Protect the Hacking Station — complete the hack bar, then reach the Escape Ship to end each wave.',
        ].join('  '), {
            fontSize: '13px', fontFamily: 'monospace', color: '#778877',
            wordWrap: { width: 1020, useAdvancedWrap: false },
            lineSpacing: 5, align: 'center',
        }).setOrigin(0.5, 0);

        // Start button
        const startText = this.add.text(centerX, 530, '[ START GAME ]', {
            fontSize: '32px',
            fontFamily: 'monospace',
            color: '#ffffff',
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });

        startText.on('pointerover', () => startText.setColor('#00ff88'));
        startText.on('pointerout',  () => startText.setColor('#ffffff'));
        startText.on('pointerdown', () => {
            // User gesture — create AudioContext and decode all pre-fetched audio.
            this.registry.get('soundSynth')?.warmup();
            const startWave = CONFIG.DEV_MODE ? Math.max(1, CONFIG.DEV_START_WAVE || 1) : 1;
            if (startWave > 1) {
                this.scene.start('IntermissionScene', {
                    wave: 0, score: 0, upgrades: [],
                    _startupMode: true, _targetWave: startWave,
                });
            } else {
                this.scene.start('GameScene');
            }
        });

        // Balance config editor button — only shown in DEV_MODE
        if (CONFIG.DEV_MODE) {
            const cfgBtn = this.add.text(centerX, 590, '[ BALANCE CONFIG ]', {
                fontSize: '15px',
                fontFamily: 'monospace',
                color: '#446666',
            }).setOrigin(0.5).setInteractive({ useHandCursor: true });

            cfgBtn.on('pointerover', () => cfgBtn.setColor('#ffdd44'));
            cfgBtn.on('pointerout',  () => cfgBtn.setColor('#446666'));
            cfgBtn.on('pointerdown', () => this._openConfigEditor());
        }

        // Clean up any lingering overlay if scene restarts
        this.events.once('shutdown', () => {
            document.getElementById('snail-config-overlay')?.remove();
        });
    }

    // ─── Config editor ───────────────────────────────────────────────────────

    _openConfigEditor() {
        if (document.getElementById('snail-config-overlay')) return;

        const inputMap = new Map(); // path → <input> element

        const close = () => {
            document.getElementById('snail-config-overlay')?.remove();
            document.removeEventListener('keydown', escHandler);
        };
        const escHandler = (e) => { if (e.key === 'Escape') close(); };
        document.addEventListener('keydown', escHandler);

        // Tiny DOM helpers
        const css = (el, styles) => { Object.assign(el.style, styles); return el; };
        const div  = (styles = {}) => css(document.createElement('div'), styles);
        const span = (text, styles = {}) => {
            const e = css(document.createElement('span'), styles);
            e.textContent = text;
            return e;
        };
        const editorBtn = (label, color, onClick) => {
            const b = document.createElement('button');
            b.textContent = label;
            css(b, {
                background: 'none', border: `1px solid ${color}`, color,
                fontFamily: 'monospace', fontSize: '13px',
                padding: '6px 14px', cursor: 'pointer',
            });
            b.addEventListener('mouseover', () => b.style.opacity = '0.75');
            b.addEventListener('mouseout',  () => b.style.opacity = '1');
            b.addEventListener('click', onClick);
            return b;
        };

        // Overlay + panel
        const overlay = div({
            position: 'fixed', inset: '0', background: 'rgba(0,0,10,0.82)',
            zIndex: '9999', display: 'flex', alignItems: 'center', justifyContent: 'center',
        });
        overlay.id = 'snail-config-overlay';
        overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

        const panel = div({
            background: '#080818', border: '2px solid #00ffcc', borderRadius: '4px',
            width: '700px', maxHeight: '82vh', display: 'flex', flexDirection: 'column',
            fontFamily: 'monospace', color: '#cccccc', fontSize: '13px',
        });
        overlay.appendChild(panel);

        // Header
        const header = div({
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '12px 16px', borderBottom: '1px solid #1a2a2a', flexShrink: '0',
        });
        header.appendChild(span('BALANCE CONFIG', { color: '#00ffcc', fontSize: '16px', fontWeight: 'bold' }));
        const xBtn = editorBtn('✕', '#555555', close);
        css(xBtn, { border: 'none', fontSize: '18px', padding: '0 4px' });
        header.appendChild(xBtn);
        panel.appendChild(header);

        // Scrollable body
        const body = div({ overflowY: 'auto', flex: '1', padding: '12px 16px' });
        panel.appendChild(body);

        // DEV_MODE checkbox (special-cased — boolean, not numeric)
        const devRow = div({
            display: 'flex', alignItems: 'center', gap: '8px',
            marginBottom: '14px', paddingBottom: '12px', borderBottom: '1px solid #1a2a2a',
        });
        const devCb = document.createElement('input');
        devCb.type    = 'checkbox';
        devCb.id      = 'cfg-DEV_MODE';
        devCb.checked = CONFIG.DEV_MODE;
        const devLbl = document.createElement('label');
        devLbl.htmlFor     = 'cfg-DEV_MODE';
        devLbl.textContent = 'DEV_MODE  (show this editor in the main menu)';
        css(devLbl, { color: '#ffdd44', cursor: 'pointer' });
        devRow.appendChild(devCb);
        devRow.appendChild(devLbl);
        body.appendChild(devRow);
        inputMap.set('DEV_MODE', devCb);

        // Recursive field renderer
        const renderFields = (parent, obj, pathPrefix, depth) => {
            const leaves = [], nested = [];
            for (const [k, v] of Object.entries(obj)) {
                if (k === 'DEV_MODE') continue;
                (typeof v === 'object' && v !== null ? nested : leaves).push([k, v]);
            }

            // Leaf values — 2-column numeric grid
            if (leaves.length > 0) {
                const grid = div({
                    display: 'grid', gridTemplateColumns: '1fr 1fr',
                    gap: '5px 20px', marginBottom: '6px',
                    marginLeft: `${depth * 14}px`,
                });
                for (const [k, v] of leaves) {
                    const path = pathPrefix ? `${pathPrefix}.${k}` : k;
                    const cell = div({ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' });

                    const lbl = document.createElement('label');
                    lbl.htmlFor     = `cfg-${path}`;
                    lbl.textContent = k;
                    css(lbl, { color: '#999999', fontSize: '12px' });

                    const inp = document.createElement('input');
                    inp.id    = `cfg-${path}`;
                    inp.type  = 'number';
                    inp.value = String(v);
                    inp.step  = Number.isInteger(v) ? '1' : 'any';
                    inp.min   = '0';
                    css(inp, {
                        width: '80px', background: '#0d0d22',
                        border: '1px solid #334466', color: '#ffffff',
                        fontFamily: 'monospace', fontSize: '12px',
                        padding: '2px 6px', textAlign: 'right', borderRadius: '2px',
                    });

                    cell.appendChild(lbl);
                    cell.appendChild(inp);
                    grid.appendChild(cell);
                    inputMap.set(path, inp);
                }
                parent.appendChild(grid);
            }

            // Nested sections — recurse
            for (const [k, v] of nested) {
                const path = pathPrefix ? `${pathPrefix}.${k}` : k;
                const sectionHdr = div({
                    color:         depth === 0 ? '#00ffcc' : '#66aaff',
                    marginTop:     depth === 0 ? '14px' : '8px',
                    marginBottom:  '5px',
                    marginLeft:    `${depth * 14}px`,
                    fontWeight:    'bold',
                    fontSize:      depth === 0 ? '13px' : '12px',
                    borderBottom:  depth === 0 ? '1px solid #1a2a2a' : 'none',
                    paddingBottom: depth === 0 ? '4px' : '0',
                });
                sectionHdr.textContent = (depth === 0 ? path : k).toUpperCase();
                parent.appendChild(sectionHdr);
                renderFields(parent, v, path, depth + 1);
            }
        };

        renderFields(body, CONFIG, '', 0);

        // Footer
        const footer = div({
            display: 'flex', gap: '12px', padding: '12px 16px',
            borderTop: '1px solid #1a2a2a', flexShrink: '0', alignItems: 'center',
        });

        footer.appendChild(editorBtn('APPLY & SAVE', '#44ff88', () => {
            for (const [path, inp] of inputMap) {
                const keys = path.split('.');
                let obj = CONFIG;
                for (let i = 0; i < keys.length - 1; i++) obj = obj[keys[i]];
                const last = keys[keys.length - 1];
                obj[last] = inp.type === 'checkbox' ? inp.checked : (parseFloat(inp.value) || 0);
            }
            saveConfig();
            close();
        }));

        footer.appendChild(editorBtn('RESET TO DEFAULTS', '#ff8844', () => {
            resetConfig();
            close();
            this._openConfigEditor(); // reopen to show fresh values
        }));

        footer.appendChild(span('Takes effect on next game start', {
            color: '#445566', fontSize: '11px', marginLeft: 'auto',
        }));

        panel.appendChild(footer);
        document.body.appendChild(overlay);
    }
}
