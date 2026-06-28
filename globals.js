// =====================================
// globals.js
// グローバル変数と定数の定義
// =====================================

// Three.js関連
let scene, camera, renderer, player, clock;

// マップ設定
const blockSize = 4.0;
const gridW = 32, gridD = 32;
const mapData = [];

// プレイヤー・物理設定
const playerRadius = 1.2;
const moveSpeed = 16.0;
const jumpHeight = blockSize * 1.5; 
const gravity = -60.0;
const jumpPower = Math.sqrt(2 * Math.abs(gravity) * jumpHeight); 
const stepHeight = 0.5; // 歩いて登れる段差

// 入力ステート (Three.jsはloaderで先に読み込み済み)
const moveVector = new THREE.Vector2(0, 0); 
let joystickTouchId = null;
let startX = 0, startY = 0;
const maxRadius = 60;

// プレイヤー状態
let isJumping = true;
let verticalVelocity = 0;

// カメラ設定
let cameraAngle = 0; 
const cameraDistance = 22;
const cameraHeight = 18;

// DOM要素
let joystickBase, joystickStick, jumpBtn;
