import type { InjectionKey } from 'vue';
import type { Progress } from '../economy/progress';
import type { GameScene } from '../view/GameScene';
import type { GameController } from './GameController';

export const CONTROLLER: InjectionKey<GameController> = Symbol('controller');
export const SCENE: InjectionKey<GameScene> = Symbol('scene');
export const PROGRESS: InjectionKey<Progress> = Symbol('progress');
