'use strict';

var helper = require( './test-helper.js' ).createRunner();
var describe = helper.describe;
var it = helper.it;
var assert = helper.assert;
var approxEqual = helper.approxEqual;

var SceneCamera = require( '../scene-camera.js' );

describe( 'scene-camera.js: getViewBox', function() {
	it( 'zoomPercent=100(Fit)は画像全体をそのままviewBoxにする', function() {
		var box = SceneCamera.getViewBox( 1000, 600, 100, 500, 300 );
		approxEqual( box.minX, 0 );
		approxEqual( box.minY, 0 );
		approxEqual( box.width, 1000 );
		approxEqual( box.height, 600 );
	} );
	it( 'zoomPercent=200は画像中心を保ったまま半分の面積を映す', function() {
		var box = SceneCamera.getViewBox( 1000, 600, 200, 500, 300 );
		approxEqual( box.width, 500 );
		approxEqual( box.height, 300 );
		approxEqual( box.minX, 250 );
		approxEqual( box.minY, 150 );
	} );
	it( '中心が右端に寄りすぎた場合は画像内へclampされる', function() {
		var box = SceneCamera.getViewBox( 1000, 600, 200, 950, 300 );
		approxEqual( box.minX, 500 ); // 1000-500(width)
		approxEqual( box.width, 500 );
	} );
	it( 'zoomPercentが100未満でも100として扱う(Fit未満には縮小しない)', function() {
		var box = SceneCamera.getViewBox( 1000, 600, 50, 500, 300 );
		approxEqual( box.width, 1000 );
	} );
	it( '画像サイズが0以下の場合は安全なフォールバックを返す', function() {
		var box = SceneCamera.getViewBox( 0, 0, 100, 0, 0 );
		assert.ok( box.width > 0 && box.height > 0 );
	} );
} );

describe( 'scene-camera.js: viewBoxToAttr', function() {
	it( '"minX minY width height" の形式の文字列を返す', function() {
		var attr = SceneCamera.viewBoxToAttr( { minX: 1, minY: 2, width: 3, height: 4 } );
		assert.strictEqual( attr, '1 2 3 4' );
	} );
} );

describe( 'scene-camera.js: zoomAt', function() {
	it( '目標zoomPercentが100以下ならFit(画像中心)へ戻す', function() {
		var cam = SceneCamera.zoomAt( 1000, 600, { zoomPercent: 200, centerX: 700, centerY: 400 }, 80, undefined, undefined, 100, 300 );
		approxEqual( cam.zoomPercent, 100 );
		approxEqual( cam.centerX, 500 );
		approxEqual( cam.centerY, 300 );
	} );
	it( 'minZoom/maxZoomでクランプされる', function() {
		var cam = SceneCamera.zoomAt( 1000, 600, { zoomPercent: 100, centerX: 500, centerY: 300 }, 999, undefined, undefined, 100, 300 );
		approxEqual( cam.zoomPercent, 300 );
	} );
	it( 'anchor点を中心に拡大すると、その点は見た目上の位置を保つ(近似)', function() {
		var startCam = { zoomPercent: 100, centerX: 500, centerY: 300 };
		var anchorX = 700, anchorY = 300; // Fit状態でのある1点
		var nextCam = SceneCamera.zoomAt( 1000, 600, startCam, 200, anchorX, anchorY, 100, 300 );
		// 拡大後のviewBox内で、anchor点の相対位置(0〜1)がほぼ変わらないことを確認する。
		var beforeBox = SceneCamera.getViewBox( 1000, 600, startCam.zoomPercent, startCam.centerX, startCam.centerY );
		var beforeRelX = ( anchorX - beforeBox.minX ) / beforeBox.width;
		var afterBox = SceneCamera.getViewBox( 1000, 600, nextCam.zoomPercent, nextCam.centerX, nextCam.centerY );
		var afterRelX = ( anchorX - afterBox.minX ) / afterBox.width;
		approxEqual( afterRelX, beforeRelX, 0.05 );
	} );
} );

describe( 'scene-camera.js: panBy', function() {
	it( 'zoomPercent<=100のときはPanできない(常にFit中心へ戻る)', function() {
		var cam = SceneCamera.panBy( 1000, 600, { zoomPercent: 100, centerX: 500, centerY: 300 }, 200, 0 );
		approxEqual( cam.centerX, 500 );
	} );
	it( 'zoomPercent>100では中心が移動し、画像外には出ない', function() {
		var cam = SceneCamera.panBy( 1000, 600, { zoomPercent: 200, centerX: 500, centerY: 300 }, 100, 0 );
		approxEqual( cam.centerX, 600 );
		var far = SceneCamera.panBy( 1000, 600, { zoomPercent: 200, centerX: 500, centerY: 300 }, 100000, 0 );
		var box = SceneCamera.getViewBox( 1000, 600, far.zoomPercent, far.centerX, far.centerY );
		assert.ok( box.minX + box.width <= 1000 + 1e-6 );
	} );
} );

module.exports = helper.summary( 'scene-camera.test.js' );
