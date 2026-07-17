// =====================================
// minigame_list.js
// ミニゲームのリストとプラグイン情報を管理
// =====================================

window.MinigameList = [
    {
        id: "survival",
        title: "崩壊サバイバル",
        icon: "minigames/survival.png",
        script: "minigames/survival.js",
        description: "歩いた足場が崩壊していく中、落下せずに最後まで生き残ったプレイヤーの勝利だ！"
    },
    {
        id: "coin_rush",
        title: "コインラッシュ",
        icon: "minigames/coin_rush.png",
        script: "minigames/coin_rush.js",
        description: "フィールドに大量に出現するコインを集めろ！制限時間終了時に最も多くのコインを持っていたプレイヤーの勝利！"
    },
    {
        id: "bom_battle",
        title: "爆弾バトル",
        icon: "minigames/bom_battle.png",
        script: "minigames/bom_battle.js",
        description: "爆弾を使ってライバルを倒そう！3回爆風に当たるか、落下すると敗北だ！※このゲーム中は入手できるアイテムが全て💣となり、所持アイテムのスタック(複数所持)が可能となります。また、出現アイテム数は下記項目で指定した数に+3個されます。"
    },
    {
        id: "paint_battle",
        title: "ペイント・バトル",
        icon: "minigames/paint_battle.png", 
        script: "minigames/paint_battle.js",
        description: "歩いた軌跡を自分の色で塗りつぶせ！制限時間終了時に最も多く陣地（色）を塗っていたプレイヤーの勝利だ。落下すると3秒間動けなくなるぞ！出現アイテムは爆弾に固定され、爆発させると広範囲を自分の色に塗れる！"
    },
    {
        id: "hot_zone",
        title: "ホットゾーン",
        icon: "minigames/hot_zone.png", 
        script: "minigames/hot_zone.js",
        description: "マップ上に出現する「光る円（ホットゾーン）」の中に入れ！円の中に立っている間だけスコアが加算されるぞ。円は15秒ごとに別の場所へ移動する。アイテムを使ってライバルを円から追い出せ！落下すると3秒間動けなくなるペナルティがあるぞ。"
    },
    {
        id: "dead_zone",
        title: "デッドゾーン",
        icon: "minigames/dead_zone.png", 
        script: "minigames/dead_zone.js",
        description: "次々と出現する「デッドゾーン」から逃げ延びろ！ゾーンは青→黄→赤と変化し、赤になった瞬間に爆発する。爆発に巻き込まれるか、落下してしまうと即リタイアだ。時間経過とともに出現間隔がどんどん短くなるぞ！"
    },
    {
        id: "crown_chase",
        title: "クラウンチェイス",
        icon: "minigames/crown_chase.png", 
        script: "minigames/crown_chase.js",
        description: "マップに出現した王冠👑を奪い合え！終了時に王冠を持っていたプレイヤーの勝利だ！王冠所持中はアイテムを使えないぞ。爆発に巻き込まれると王冠を落としてしまうので、他プレイヤーから逃げ切れ！"
    }
];

