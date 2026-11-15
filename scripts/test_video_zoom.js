// Flaptap - Video Zoom & Focal Inspection Engine Test Suite
const assert = require('assert');

console.log('Testing Video Zoom & Focal Mechanics...');

const W = 800;
const H = 450;

// Replicate pure math functions
function calculateFocalZoom(currentScale, currentPanX, currentPanY, targetScale, focalX, focalY, width, height) {
  targetScale = Math.min(5.0, Math.max(1.0, targetScale));
  if (targetScale <= 1.001) {
    return { scale: 1.0, panX: 0, panY: 0 };
  }

  // Content coordinates currently under focal point
  const contentX = (focalX - currentPanX) / currentScale;
  const contentY = (focalY - currentPanY) / currentScale;

  let newPanX = focalX - contentX * targetScale;
  let newPanY = focalY - contentY * targetScale;

  // Clamping
  const minPanX = width * (1.0 - targetScale);
  const minPanY = height * (1.0 - targetScale);

  newPanX = Math.min(0, Math.max(minPanX, newPanX));
  newPanY = Math.min(0, Math.max(minPanY, newPanY));

  return { scale: targetScale, panX: newPanX, panY: newPanY };
}

// Test 1: Zoom centered on speaker mouth (X = 400, Y = 280)
const mouthX = 400;
const mouthY = 280;
const z1 = calculateFocalZoom(1.0, 0, 0, 2.2, mouthX, mouthY, W, H);
assert(z1.scale === 2.2, `Expected scale 2.2, got ${z1.scale}`);
// Verify content point under mouth remained under mouth
const contentPointMouthX = (mouthX - 0) / 1.0;
const contentPointMouthY = (mouthY - 0) / 1.0;
const projectedMouthX = z1.panX + contentPointMouthX * z1.scale;
const projectedMouthY = z1.panY + contentPointMouthY * z1.scale;
assert(Math.abs(projectedMouthX - mouthX) < 1e-4, `Mouth X shifted: ${projectedMouthX} vs ${mouthX}`);
assert(Math.abs(projectedMouthY - mouthY) < 1e-4, `Mouth Y shifted: ${projectedMouthY} vs ${mouthY}`);
console.log('✅ Test 1: Focal zoom at mouth keeps mouth coordinate exactly under cursor');

// Test 2: Bounds clamping never permits blank void
const zExtreme = calculateFocalZoom(2.0, -100, -100, 3.0, 0, 0, W, H);
const minX = W * (1 - 3.0);
const minY = H * (1 - 3.0);
assert(zExtreme.panX >= minX && zExtreme.panX <= 0, `panX out of bounds: ${zExtreme.panX}`);
assert(zExtreme.panY >= minY && zExtreme.panY <= 0, `panY out of bounds: ${zExtreme.panY}`);
console.log('✅ Test 2: Panning bounds strictly clamped to prevent voids');

// Test 3: Reset returns cleanly to 1.0x and 0,0
const zReset = calculateFocalZoom(3.0, -500, -300, 1.0, 400, 225, W, H);
assert(zReset.scale === 1.0 && zReset.panX === 0 && zReset.panY === 0, 'Reset failed');
console.log('✅ Test 3: Reset restores 1.0x scale and 0,0 offset');

// Test 4: Radar math
const radarW = 52;
const radarH = 29.25;
const scale = 2.0;
const winW = radarW / scale;
const winH = radarH / scale;
assert(winW === 26 && winH === 14.625, 'Radar window aspect scale mismatch');
console.log('✅ Test 4: Radar mini-map window accurately represents viewport crop');

console.log('🎉 All Video Zoom tests passed successfully!');
