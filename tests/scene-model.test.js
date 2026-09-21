'use strict';

var helper = require( './test-helper.js' ).createRunner();
var describe = helper.describe;
var it = helper.it;
var assert = helper.assert;
var approxEqual = helper.approxEqual;

var Geometry = require( '../geometry.js' );
var SceneModel = require( '../scene-model.js' );

function baseAttributes( overrides ) {
	return Object.assign( {
		imageUrl: 'https://example.com/x.png',
		imageWidth: 800,
		imageHeight: 600,
		pins: []
	}, overrides || {} );
}

describe( 'scene-model.js: buildSceneModel — 保存データ互換', function() {
	it( 'pin.x/yは百分率のまま保持し、natural座標(cx/cy)も併せて計算する', function() {
		var model = SceneModel.buildSceneModel( baseAttributes( {
			pins: [ { id: 'p1', x: 25, y: 75 } ]
		} ), Geometry );
		var pin = model.pins[ 0 ];
		assert.strictEqual( pin.xPercent, 25 );
		assert.strictEqual( pin.yPercent, 75 );
		approxEqual( pin.cx, 200 ); // 800*0.25
		approxEqual( pin.cy, 450 ); // 600*0.75
	} );
	it( 'markerScaleが範囲外ならデフォルト(100)へフォールバックする', function() {
		var model = SceneModel.buildSceneModel( baseAttributes( {
			pins: [ { id: 'p1', x: 0, y: 0, markerScale: 9999 } ]
		} ), Geometry );
		assert.strictEqual( model.pins[ 0 ].markerScale, 100 );
	} );
	it( 'markerImageUrlが空ならhasMarker=false', function() {
		var model = SceneModel.buildSceneModel( baseAttributes( {
			pins: [ { id: 'p1', x: 0, y: 0, markerImageUrl: '' } ]
		} ), Geometry );
		assert.strictEqual( model.pins[ 0 ].hasMarker, false );
	} );
	it( 'showLabel未設定・画像マーカー無しは常にshow=true(ラベル文字がある場合)', function() {
		var model = SceneModel.buildSceneModel( baseAttributes( {
			pins: [ { id: 'p1', x: 0, y: 0, label: 'X' } ]
		} ), Geometry );
		assert.strictEqual( model.pins[ 0 ].label.show, true );
	} );
	it( '画像マーカー有りでshowLabel:falseならshow=false', function() {
		var model = SceneModel.buildSceneModel( baseAttributes( {
			pins: [ { id: 'p1', x: 0, y: 0, label: 'X', markerImageUrl: 'https://example.com/m.png', showLabel: false } ]
		} ), Geometry );
		assert.strictEqual( model.pins[ 0 ].label.show, false );
	} );
} );

describe( 'scene-model.js: buildSceneModel — Popover色のセンチネル値保持', function() {
	it( 'popoverBackgroundColor/TextColorが未設定(空文字)ならそのまま空文字を保持する(fallback解決はしない)', function() {
		var model = SceneModel.buildSceneModel( baseAttributes( {
			popoverBackgroundColor: '', popoverTextColor: ''
		} ), Geometry );
		assert.strictEqual( model.appearance.popover.backgroundColorRaw, '' );
		assert.strictEqual( model.appearance.popover.textColorRaw, '' );
	} );
	it( '明示設定された色はそのまま保持する', function() {
		var model = SceneModel.buildSceneModel( baseAttributes( {
			popoverBackgroundColor: '#123456', popoverTextColor: '#abcdef'
		} ), Geometry );
		assert.strictEqual( model.appearance.popover.backgroundColorRaw, '#123456' );
		assert.strictEqual( model.appearance.popover.textColorRaw, '#abcdef' );
	} );
} );

describe( 'scene-model.js: buildSceneModel — 数値フォールバック(クランプではない)', function() {
	it( 'pinSizeが範囲外ならデフォルト(24)へフォールバックする(丸めない)', function() {
		var model = SceneModel.buildSceneModel( baseAttributes( { pinSize: 99999 } ), Geometry );
		assert.strictEqual( model.appearance.pin.size, 24 );
	} );
	it( 'labelBackgroundOpacityが範囲内ならそのまま使う', function() {
		var model = SceneModel.buildSceneModel( baseAttributes( { labelBackgroundOpacity: 42 } ), Geometry );
		assert.strictEqual( model.appearance.label.backgroundOpacity, 42 );
	} );
} );

describe( 'scene-model.js: buildSceneModel — 派生値を持たない(Resolved Sceneではない)', function() {
	it( '戻り値にresolvedWidth/lines/bbox等の派生フィールドを一切含まない', function() {
		var model = SceneModel.buildSceneModel( baseAttributes( {
			pins: [ { id: 'p1', x: 0, y: 0, label: 'X', description: 'Y' } ]
		} ), Geometry );
		var pin = model.pins[ 0 ];
		assert.strictEqual( pin.resolvedWidth, undefined );
		assert.strictEqual( pin.lines, undefined );
		assert.strictEqual( model.camera, undefined );
	} );
} );

describe( 'scene-model.js: buildSceneModel — 吹き出し先端サイズ(labelTailSize/popoverTailSize)', function() {
	it( '未設定(既存記事)はmedium', function() {
		var model = SceneModel.buildSceneModel( baseAttributes( {} ), Geometry );
		assert.strictEqual( model.appearance.label.tailSize, 'medium' );
		assert.strictEqual( model.appearance.popover.tailSize, 'medium' );
	} );
	it( 'small/large はLabel・Popoverそれぞれ独立に保持される', function() {
		var model = SceneModel.buildSceneModel( baseAttributes( { labelTailSize: 'small', popoverTailSize: 'large' } ), Geometry );
		assert.strictEqual( model.appearance.label.tailSize, 'small' );
		assert.strictEqual( model.appearance.popover.tailSize, 'large' );
	} );
	it( '不正な値はmediumへフォールバックする', function() {
		var model = SceneModel.buildSceneModel( baseAttributes( { labelTailSize: 'xl', popoverTailSize: 5 } ), Geometry );
		assert.strictEqual( model.appearance.label.tailSize, 'medium' );
		assert.strictEqual( model.appearance.popover.tailSize, 'medium' );
	} );
} );

module.exports = helper.summary( 'scene-model.test.js' );
