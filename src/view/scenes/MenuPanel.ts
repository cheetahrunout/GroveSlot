import { Container, Graphics, Text } from 'pixi.js';
import { JACKPOTS } from '../../config/features';
import { PAYLINES } from '../../config/paylines';
import { CASH_TRIGGER_COUNT, LINE_PAYS, SCATTER_PAYS } from '../../config/paytable';
import type { SymbolId } from '../../config/symbols';
import { ACHIEVEMENTS, SKINS, type SkinId } from '../../economy/achievements';
import type { Progress, Settings } from '../../economy/progress';
import type { LeaderboardCategory, LeaderboardEntry, LeaderboardService } from '../../leaderboard/leaderboard';
import { Button } from '../Button';
import { fmt } from '../format';
import type { Layout } from '../layout';
import { symbolLabel } from '../SymbolView';
import { COLORS, textStyle } from '../theme';

type Tab = 'pays' | 'stats' | 'trophies' | 'leaders' | 'settings';
const TABS: { id: Tab; label: string }[] = [
  { id: 'pays', label: 'PAYS' },
  { id: 'stats', label: 'STATS' },
  { id: 'trophies', label: 'TROPHIES' },
  { id: 'leaders', label: 'LEADERS' },
  { id: 'settings', label: 'SETTINGS' },
];

export interface MenuDeps {
  progress: Progress;
  leaderboard: LeaderboardService;
  lineBet: number;
  onSettings(patch: Partial<Settings>): void;
}

const LEADER_BOARDS: { id: LeaderboardCategory; title: string; format: (n: number) => string }[] = [
  { id: 'biggestWin', title: 'BIGGEST WIN', format: fmt },
  { id: 'biggestMultiplier', title: 'BIGGEST WIN (x BET)', format: (n) => `x${n}` },
  { id: 'territoriesTaken', title: 'TERRITORIES', format: (n) => String(n) },
];

/** Paytable, stats, trophies, leaderboard and settings in one modal. */
export class MenuPanel extends Container {
  private readonly content = new Container();
  private readonly tabButtons = new Map<Tab, Button>();
  private readonly panelW: number;
  private readonly panelH: number;
  private readonly portrait: boolean;
  private closeResolve!: () => void;
  readonly closed = new Promise<void>((r) => (this.closeResolve = r));

  constructor(layout: Layout, private readonly deps: MenuDeps) {
    super();
    const { width: W, height: H } = layout;
    this.portrait = layout.mode === 'portrait';
    this.panelW = this.portrait ? W - 60 : 1560;
    this.panelH = this.portrait ? H - 200 : 960;
    const dim = new Graphics().rect(0, 0, W, H).fill({ color: 0x000000, alpha: 0.7 });
    dim.eventMode = 'static';
    const panel = new Container();
    panel.position.set((W - this.panelW) / 2, (H - this.panelH) / 2);
    panel.addChild(new Graphics().roundRect(0, 0, this.panelW, this.panelH, 30).fill('#0f1f10').stroke({ color: COLORS.gold, width: 6 }));

    const tabW = Math.min(250, (this.panelW - 160 - 4 * 12) / 5);
    TABS.forEach((tab, i) => {
      const b = new Button({ width: tabW, height: 76, label: tab.label, fontSize: 30, fill: COLORS.panel }, () => this.open(tab.id));
      b.setText(tab.label);
      b.position.set(30 + i * (tabW + 12), 26);
      panel.addChild(b);
      this.tabButtons.set(tab.id, b);
    });
    const close = new Button({ width: 76, height: 76, label: '✕', fontSize: 40, fill: COLORS.danger }, () => this.close());
    close.position.set(this.panelW - 106, 26);
    this.content.position.set(40, 130);
    panel.addChild(close, this.content);
    this.addChild(dim, panel);
    this.open('pays');
  }

  close(): void {
    this.destroy({ children: true });
    this.closeResolve();
  }

  private clear(): void {
    this.content.removeChildren().forEach((c) => c.destroy({ children: true }));
  }

  private write(text: string, x: number, y: number, color: string = COLORS.text, size = 32, anchorX = 0): Text {
    const t = new Text({ text, style: textStyle(color, size) });
    t.anchor.set(anchorX, 0);
    t.position.set(x, y);
    this.content.addChild(t);
    return t;
  }

  private open(tab: Tab): void {
    this.tabButtons.forEach((b, id) => b.setActive(id === tab));
    this.clear();
    if (tab === 'pays') this.renderPays();
    if (tab === 'stats') this.renderStats();
    if (tab === 'trophies') this.renderTrophies();
    if (tab === 'leaders') void this.renderLeaders();
    if (tab === 'settings') this.renderSettings();
  }

  private renderPays(): void {
    const bet = this.deps.lineBet;
    const totalBet = bet * PAYLINES.length;
    this.write(`Line pays at your bet (${fmt(bet)} per line, ${PAYLINES.length} lines, left to right)`, 0, 0, COLORS.muted, 28);
    const symbols = Object.keys(LINE_PAYS) as SymbolId[];
    const cols = this.portrait ? 2 : 3;
    const colW = (this.panelW - 80) / cols;
    symbols.forEach((sym, i) => {
      const p = LINE_PAYS[sym]!;
      const x = (i % cols) * colW;
      const y = 50 + Math.floor(i / cols) * 54;
      this.write(sym === 'WILD' ? 'TRIDENT G (WILD)' : symbolLabel(sym), x, y, sym === 'WILD' ? COLORS.gold : COLORS.text, 30);
      this.write(`${fmt(p[3] * bet)} · ${fmt(p[4] * bet)} · ${fmt(p[5] * bet)}`, x + colW - 30, y, COLORS.gold, 30, 1);
    });
    const y = 50 + Math.ceil(symbols.length / cols) * 54 + 20;
    const lines = [
      `SPRAY CAN anywhere: 3 / 4 / 5 pay ${[3, 4, 5].map((n) => fmt(SCATTER_PAYS[n] * totalBet)).join(' / ')} and start 10 / 15 / 20 FREE SPINS`,
      'LOWRIDER on reels 1, 3 and 5: LOWRIDER HOP · PALM G on reels 2, 3 and 4: TURF WAR',
      `${CASH_TRIGGER_COUNT}+ CASH BAGS: CASH RUN · Jackpots: ${(['homie', 'soldier', 'og', 'kingpin'] as const)
        .map((j) => `${JACKPOTS[j].name} ${JACKPOTS[j].multiplier}x`)
        .join(', ')} (+ pot)`,
      'The Trident G stands in for every symbol except Spray Can, Lowrider, Palm G and Cash Bag.',
    ];
    let lineY = y;
    for (const l of lines) {
      const t = this.write(l, 0, lineY, COLORS.muted, 26);
      t.style.wordWrap = true;
      t.style.wordWrapWidth = this.panelW - 80;
      lineY += t.height + 14;
    }
  }

  private renderStats(): void {
    const s = this.deps.progress.stats;
    const minutes = Math.round(s.playTimeMs / 60000);
    const rows: [string, string][] = [
      ['Spins played', fmt(s.spins)],
      ['Tokens bet', fmt(s.totalBet)],
      ['Tokens won', fmt(s.totalWon)],
      ['Biggest win', `${fmt(s.biggestWin)} (x${Math.round(s.biggestMultiplier * 10) / 10})`],
      ['Free Spins', fmt(s.featureCounts.freeSpins)],
      ['Lowrider Hops', fmt(s.featureCounts.lowriderHop)],
      ['Cash Runs', fmt(s.featureCounts.holdAndSpin)],
      ['Turf Wars', fmt(s.featureCounts.turfWar)],
      ['Territories taken', fmt(s.territoriesTaken)],
      ['Kingpin jackpots', fmt(s.kingpins)],
      ['Wanted paydays', fmt(s.paydays)],
      ['Drive-Bys', fmt(s.driveBys)],
      ['Best Car Chase streak', fmt(s.bestChaseStreak)],
      ['Time played', minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`],
    ];
    const cols = this.portrait ? 1 : 2;
    const colW = (this.panelW - 80) / cols;
    const perCol = Math.ceil(rows.length / cols);
    rows.forEach(([k, v], i) => {
      const x = Math.floor(i / perCol) * colW;
      const y = (i % perCol) * 62;
      this.write(k, x, y, COLORS.muted, 34);
      this.write(v, x + colW - 40, y, COLORS.gold, 34, 1);
    });
  }

  private renderTrophies(): void {
    const p = this.deps.progress;
    const cols = this.portrait ? 1 : 2;
    const colW = (this.panelW - 80) / cols;
    ACHIEVEMENTS.forEach((a, i) => {
      const x = (i % cols) * colW;
      const y = Math.floor(i / cols) * 112;
      const done = p.isUnlocked(a.id);
      const box = new Graphics().roundRect(x, y, colW - 20, 100, 16).fill(done ? '#1f3d1f' : '#141414').stroke({ color: done ? COLORS.gold : '#333', width: 3 });
      this.content.addChild(box);
      this.write(`${done ? '🏆' : '🔒'} ${a.name}`, x + 20, y + 10, done ? COLORS.gold : COLORS.muted, 34);
      const unlock = a.unlocks ? ` · unlocks ${SKINS[a.unlocks].name}` : '';
      this.write(`${a.description}${unlock}`, x + 20, y + 58, COLORS.text, 24);
    });
  }

  private async renderLeaders(): Promise<void> {
    const boards = await Promise.all(LEADER_BOARDS.map((b) => this.deps.leaderboard.top(b.id, 10)));
    if (this.destroyed) return;
    const cols = this.portrait ? 1 : 3;
    const colW = (this.panelW - 80) / cols;
    LEADER_BOARDS.forEach((board, i) => {
      const x = (i % cols) * colW;
      const y0 = this.portrait ? i * 420 : 0;
      this.write(board.title, x, y0, COLORS.gold, 36);
      const entries: LeaderboardEntry[] = boards[i];
      if (entries.length === 0) this.write('No scores yet', x, y0 + 60, COLORS.muted, 28);
      entries.slice(0, this.portrait ? 5 : 10).forEach((e, k) => {
        const y = y0 + 60 + k * 62;
        this.write(`${k + 1}. ${e.name}`, x, y, COLORS.text, 30);
        this.write(board.format(e.score), x + colW - 50, y, COLORS.gold, 30, 1);
      });
    });
    this.write('Saved on this device. Online leaderboards can plug in later.', 0, this.panelH - 210, COLORS.muted, 24);
  }

  private renderSettings(): void {
    const { progress, onSettings } = this.deps;
    const s = progress.settings;
    const toggles: { key: 'gamble' | 'sound' | 'music'; label: string }[] = [
      { key: 'gamble', label: 'Offer the Car Chase gamble after wins' },
      { key: 'sound', label: 'Sound effects' },
      { key: 'music', label: 'Music' },
    ];
    toggles.forEach((t, i) => {
      const y = i * 100;
      this.write(t.label, 0, y + 20, COLORS.text, 34);
      const b = new Button({ width: 160, height: 76, label: s[t.key] ? 'ON' : 'OFF', fontSize: 34 }, () => {
        onSettings({ [t.key]: !progress.settings[t.key] });
        this.open('settings');
      });
      b.setActive(s[t.key]);
      b.position.set(this.panelW - 280, y);
      this.content.addChild(b);
    });

    const y = 330;
    this.write(`Player name: ${s.name}`, 0, y + 20, COLORS.text, 34);
    const rename = new Button({ width: 240, height: 76, label: 'CHANGE', fontSize: 32 }, () => {
      const name = window.prompt('Name for the leaderboard (max 12 characters)', s.name);
      if (name && name.trim()) onSettings({ name: name.trim().slice(0, 12).toUpperCase() });
      this.open('settings');
    });
    rename.position.set(this.panelW - 360, y);
    this.content.addChild(rename);

    this.write('Reel skin (unlock more with trophies)', 0, y + 130, COLORS.muted, 30);
    const skins = Object.keys(SKINS) as SkinId[];
    const bw = Math.min(330, (this.panelW - 80 - 3 * 16) / 4);
    skins.forEach((id, i) => {
      const unlocked = progress.isSkinUnlocked(id);
      const b = new Button({ width: bw, height: 90, label: unlocked ? SKINS[id].name : `🔒 ${SKINS[id].name}`, fontSize: 28, fill: SKINS[id].backdrop }, () => {
        onSettings({ skin: id });
        this.open('settings');
      });
      b.setText(unlocked ? SKINS[id].name : `🔒 ${SKINS[id].name}`);
      b.setEnabled(unlocked);
      b.setActive(s.skin === id);
      const px = this.portrait ? (i % 2) * (bw + 16) : i * (bw + 16);
      const py = y + 180 + (this.portrait ? Math.floor(i / 2) * 106 : 0);
      b.position.set(px, py);
      this.content.addChild(b);
    });
    this.write('Tokens are for fun only: they cannot be bought, sold or cashed out.', 0, this.panelH - 210, COLORS.muted, 24);
  }
}
