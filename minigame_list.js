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
    }
];


