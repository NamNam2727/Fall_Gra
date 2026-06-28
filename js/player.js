// =====================================
// player.js
// プレイヤーキャラクターの生成とテクスチャ（高画質版）
// =====================================

// 仮のアイコンテクスチャを生成する関数（高解像度 512x512 に引き上げ）
function createIconTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512; 
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    
    // 背景
    ctx.fillStyle = '#ffffff'; 
    ctx.fillRect(0, 0, 512, 512);
    
    // オレンジの円
    ctx.beginPath(); 
    ctx.arc(256, 256, 240, 0, Math.PI * 2);
    ctx.fillStyle = '#FFDD88'; 
    ctx.fill();
    ctx.lineWidth = 12; 
    ctx.strokeStyle = '#FFAA00'; 
    ctx.stroke();

    // 顔のパーツ
    ctx.fillStyle = '#333333';
    ctx.beginPath(); ctx.arc(180, 320, 30, 0, Math.PI * 2); ctx.fill(); // 左目
    ctx.beginPath(); ctx.arc(332, 320, 30, 0, Math.PI * 2); ctx.fill(); // 右目
    ctx.beginPath(); ctx.arc(256, 320, 80, 0.2 * Math.PI, 0.8 * Math.PI); // 口
    ctx.lineWidth = 16; 
    ctx.strokeStyle = '#333333'; 
    ctx.stroke();

    // 文字
    ctx.fillStyle = '#FFFFFF'; 
    ctx.font = 'bold 90px sans-serif'; 
    ctx.textAlign = 'center';
    ctx.fillText('G', 256, 220);

    const texture = new THREE.CanvasTexture(canvas);
    texture.center.set(0.5, 0.5);
    texture.rotation = -Math.PI / 2; // 正面を向くように回転
    
    // 【画質向上設定】
    if (renderer) {
        // 斜めから見た時のテクスチャのぼやけを防ぐ（異方性フィルタリング）
        texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    }
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    
    return texture;
}

function initPlayer() {
    player = new THREE.Group();
    
    // 黒い下層
    const baseGeo = new THREE.CylinderGeometry(playerRadius, playerRadius, 0.2, 32);
    const blackMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.7 });
    const baseMesh = new THREE.Mesh(baseGeo, blackMat);
    baseMesh.position.y = 0.1; 
    baseMesh.castShadow = true; 
    player.add(baseMesh);

    // 白い上層と顔アイコン
    const topGeo = new THREE.CylinderGeometry(playerRadius, playerRadius, 0.2, 32);
    
    // デフォルト（仮）のアイコンテクスチャを設定
    const defaultIconTexture = createIconTexture();
    
    const sideMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.7 });
    const topMat = new THREE.MeshStandardMaterial({ map: defaultIconTexture, roughness: 0.7 });
    const bottomMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.7 });
    
    // [側面, 上面, 底面] の順にマテリアルを適用
    const topMesh = new THREE.Mesh(topGeo, [sideMat, topMat, bottomMat]);
    topMesh.position.y = 0.3; 
    topMesh.castShadow = true; 
    player.add(topMesh);

    player.position.set(0, 20, 0);
    scene.add(player);

    // ==========================================
    // GRAVITY SDKのアイコン画像を読み込んで差し替える処理
    // ==========================================
    if (window.GameState && window.GameState.userInfo && window.GameState.userInfo.portrait) {
        const imageUrl = window.GameState.userInfo.portrait;
        
        const loader = new THREE.TextureLoader();
        loader.setCrossOrigin('anonymous');
        
        loader.load(
            imageUrl,
            function (loadedTexture) {
                loadedTexture.center.set(0.5, 0.5);
                loadedTexture.rotation = -Math.PI / 2;
                
                // 【画質向上設定】
                if (renderer) {
                    loadedTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();
                }
                loadedTexture.minFilter = THREE.LinearMipmapLinearFilter;
                loadedTexture.magFilter = THREE.LinearFilter;
                
                // テクスチャを差し替え
                topMesh.material[1].map = loadedTexture;
                topMesh.material[1].needsUpdate = true;
                console.log('ユーザーアイコンの読み込みに成功しました (高画質設定適用)');
            },
            undefined,
            function (err) {
                console.warn('ユーザーアイコンの読み込みに失敗したため、デフォルトアイコンを使用します', err);
            }
        );
    }
}
