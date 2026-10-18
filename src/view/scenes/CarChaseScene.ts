import { Container, Graphics, Text } from 'pixi.js';
import { GAMBLE } from '../../config/features';
import type { Alley } from '../../engine/features/gamble';
import { createLowrider } from '../art/lowrider';
import { sound } from '../../audio/sound';
import { Button } from '../Button';
import { euro } from '../format';
import type { Layout } from '../layout';
import { COLORS, FONT_TAG, textStyle } from '../theme';
import { easeInOutQuad, tween, wait } from '../tween';

/** Asks the game server to play one pick; it decides and the casino settles. */
export type GambleResolver = (pick: Alley) => Promise<{ escape: Alley; won: boolean; stake: number; canContinue: boolean }>;

/** Car Chase: pick the alley the cops are not watching to double the win. */
export class CarChaseScene extends Container {
  private readonly W: number;
  private readonly H: number;
  private readonly groundY: number;

  constructor(layout: Layout) {
    super();
    this.W = layout.width;
    this.H = layout.height;
    this.groundY = this.H * (layout.mode === 'portrait' ? 0.6 : 0.68);
    const bg = new Graphics();
    bg.rect(0, 0, this.W, this.groundY).fill('#0b1022');
    // Buildings with two dark alleys.
    const alleyW = 220;
    for (let x = 0; x < this.W; x += 160) {
      const h = 260 + ((x * 37) % 170);
      bg.rect(x, this.groundY - h, 150, h).fill('#161c33');
      for (let wy = this.groundY - h + 30; wy < this.groundY - 40; wy += 60) {
        for (let wx = x + 20; wx < x + 130; wx += 45) {
          if ((wx * 7 + wy * 3) % 5 < 2) bg.rect(wx, wy, 22, 28).fill('#f2d36b');
        }
      }
    }
    for (const ax of this.alleyX) {
      bg.rect(ax - alleyW / 2, this.groundY - 330, alleyW, 330).fill('#04060d');
    }
    bg.rect(0, this.groundY, this.W, this.H - this.groundY).fill('#22232a');
    for (let x = 30; x < this.W; x += 200) bg.rect(x, this.groundY + 120, 110, 12).fill('#d9d9d9');
    bg.eventMode = 'static';
    this.addChild(bg);
  }

  private get alleyX(): [number, number] {
    return [this.W * 0.22, this.W * 0.78];
  }

  private text(content: string, size: number, color: string, y: number): Text {
    const t = new Text({ text: content, style: textStyle(color, size, { stroke: { color: COLORS.background, width: 6 } }) });
    t.anchor.set(0.5);
    t.position.set(this.W / 2, y);
    this.addChild(t);
    return t;
  }

  private policeCar(): Container {
    const { car, body } = createLowrider(0xf2f2f2);
    const bar = new Graphics();
    body.addChild(bar);
    let on = false;
    const flash = setInterval(() => {
      on = !on;
      bar.clear().rect(-40, -168, 40, 18).fill(on ? '#ff2a2a' : '#5a1010').rect(0, -168, 40, 18).fill(on ? '#1e2f5a' : '#2a6aff');
    }, 160);
    car.once('destroyed', () => clearInterval(flash));
    return car;
  }

  /** Runs the gamble; returns the stake the player leaves with. */
  async play(originalWin: number, resolve: GambleResolver, maxRounds: number = GAMBLE.maxRounds): Promise<number> {
    const portrait = this.H > this.W;
    this.text('CAR CHASE', 110, COLORS.gold, portrait ? 180 : 80).style.fontFamily = FONT_TAG;
    this.text('PICK THE ALLEY THE COPS ARE NOT WATCHING', 38, COLORS.text, portrait ? 280 : 170);
    const stakeText = this.text('', 64, COLORS.gold, portrait ? 380 : 250);
    const roundText = this.text('', 34, COLORS.muted, portrait ? 450 : 320);
    const resultText = this.text('', 90, COLORS.text, this.groundY - 420);

    const { car } = createLowrider(0x2f9d3f);
    car.scale.set(0.8);
    car.position.set(this.W / 2, this.groundY + 70);
    this.addChild(car);

    let choose!: (choice: Alley | 'collect') => void;
    const buttonY = portrait ? this.H - 330 : this.H - 110;
    const left = new Button({ width: 320, height: 110, label: '◀ LEFT ALLEY', fontSize: 38 }, () => choose('left'));
    const right = new Button({ width: 320, height: 110, label: 'RIGHT ALLEY ▶', fontSize: 38 }, () => choose('right'));
    const collect = new Button({ width: 300, height: 110, label: 'COLLECT', fontSize: 40, fill: COLORS.gold, textColor: COLORS.background }, () =>
      choose('collect'),
    );
    if (portrait) {
      left.position.set(this.W / 2 - 340, buttonY);
      right.position.set(this.W / 2 + 20, buttonY);
      collect.position.set(this.W / 2 - 150, buttonY + 140);
    } else {
      left.position.set(this.W / 2 - 520, buttonY);
      right.position.set(this.W / 2 + 200, buttonY);
      collect.position.set(this.W / 2 - 150, buttonY);
    }
    this.addChild(left, right, collect);
    const buttons = [left, right, collect];

    let stake = originalWin;
    let round = 0;
    let canContinue = true;
    while (canContinue) {
      stakeText.text = `STAKE ${euro(stake)} → ${euro(stake * 2)}`;
      roundText.text = `ROUND ${round + 1} OF ${maxRounds}`;
      buttons.forEach((b) => b.setEnabled(true));
      const choice = await new Promise<Alley | 'collect'>((r) => (choose = r));
      buttons.forEach((b) => b.setEnabled(false));
      if (choice === 'collect') break;

      let outcome;
      try {
        outcome = await resolve(choice);
      } catch (e) {
        // Refused or voided: the stake was never lost.
        resultText.style.fill = COLORS.text;
        resultText.text = '';
        roundText.text = (e as Error).message;
        await wait(2000);
        break;
      }
      round++;
      canContinue = outcome.canContinue;
      const target = this.alleyX[choice === 'left' ? 0 : 1];
      car.scale.x = choice === 'left' ? -0.8 : 0.8;
      sound.play('skid');
      await tween(car, { x: target }, 700, easeInOutQuad);
      if (outcome.won) {
        await tween(car, { alpha: 0, 'scale.y': 0.4 }, 300);
        resultText.style.fill = COLORS.groveLight;
        resultText.text = 'ESCAPED!';
        sound.play('cheer');
        stake = outcome.stake;
        await wait(900);
        car.alpha = 1;
        car.scale.set(0.8);
        car.x = this.W / 2;
        resultText.text = '';
      } else {
        const cop = this.policeCar();
        cop.scale.set(choice === 'left' ? 0.8 : -0.8, 0.8);
        cop.position.set(target, this.groundY - 10);
        cop.alpha = 0;
        this.addChild(cop);
        await tween(cop, { alpha: 1 }, 250);
        resultText.style.fill = '#ff5a3c';
        resultText.text = 'BUSTED!';
        sound.play('siren');
        stake = 0;
        stakeText.text = 'STAKE LOST';
        await wait(1600);
        cop.destroy({ children: true });
        break;
      }
    }

    if (stake > 0) {
      stakeText.text = `COLLECTED ${euro(stake)}`;
      if (!canContinue && round > 0) roundText.text = 'MAX CHASE REACHED';
      await wait(1000);
    }
    return stake;
  }
}
