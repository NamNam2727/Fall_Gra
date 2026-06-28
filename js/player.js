// =====================================
// player.js
// プレイヤーキャラクターの生成とテクスチャ
// =====================================

function createIconTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 256;
    const ctx = canvas.getContext('2d');
    
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 256, 256);
    
    ctx.beginPath(); ctx.arc(128, 128, 120, 0, Math.PI * 2);
    ctx.fillStyle = '#FFDD88'; ctx.fill();
    ctx.lineWidth = 6; ctx.strokeStyle = '#FFAA00'; ctx.stroke();

    ctx.fillStyle = '#333333';
    ctx.beginPath(); ctx.arc(90, 160, 15, 0, Math.PI * 2); ctx.fill(); 
    ctx.beginPath(); ctx.arc(166, 160, 15, 0, Math.PI * 2); ctx.fill(); 
    ctx.beginPath(); ctx.arc(128, 160, 40, 0.2 * Math.PI, 0.8 * Math.PI); 
    ctx.lineWidth = 8; ctx.strokeStyle = '#333333'; ctx.stroke();

    ctx.fillStyle = '#FFFFFF'; ctx.font = 'bold 45px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('G', 128, 110);

    const texture = new THREE.CanvasTexture(canvas);
    texture.center.set(0.5, 0.5);
    texture.rotation = -Math.PI / 2; // 正面を向くように回転
    
    return texture;
}

function initPlayer() {
    player = new THREE.Group();
    
    // 黒い下層
    const baseGeo = new THREE.CylinderGeometry(playerRadius, playerRadius, 0.2, 32);
    const blackMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.7 });
    const baseMesh = new THREE.Mesh(baseGeo, blackMat);
    baseMesh.position.y = 0.1; baseMesh.castShadow = true; 
    player.add(baseMesh);

    // 白い上層と顔アイコン
    const topGeo = new THREE.CylinderGeometry(playerRadius, playerRadius, 0.2, 32);
    const iconTexture = createIconTexture();
    const sideMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.7 });
    const topMat = new THREE.MeshStandardMaterial({ map: iconTexture, roughness: 0.7 });
    const bottomMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.7 });
    
    const topMesh = new THREE.Mesh(topGeo, [sideMat, topMat, bottomMat]);
    topMesh.position.y = 0.3; topMesh.castShadow = true; 
    player.add(topMesh);

    player.position.set(0, 20, 0);
    scene.add(player);
}
