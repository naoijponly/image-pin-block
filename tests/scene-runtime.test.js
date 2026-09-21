'use strict';

// 実WordPress受入確認で見つかった回帰(Description Interaction)の
// 再発防止テスト。resolvePinA11y()はDOM(SVG計測)を必要としない純粋関数として
// scene-runtime.jsからexportされている(唯一の判断箇所。svg-renderer.jsの
// pointer-events/hover委譲ロジック自体は実DOM/実SVGを要するため、Browser toolでの
// 実機検証で別途確認済み。このファイルはNode上でテスト可能な「a11y種別の判断」
// だけを対象にする)。

var helper = require( './test-helper.js' ).createRunner();
var describe = helper.describe;
var it = helper.it;
var assert = helper.assert;

var SceneRuntime = require( '../scene-runtime.js' );
var resolvePinA11y = SceneRuntime.resolvePinA11y;

function pinModel( overrides ) {
	return Object.assign( {
		id: 'pin-1',
		target: '',
		hasDescription: false,
		description: '',
		label: { hasText: false, text: '' }
	}, overrides || {} );
}

describe( 'scene-runtime.js: resolvePinA11y — Frontend/Lightbox(editorOverlay=false)', function() {
	it( 'Descriptionあり・targetなし・hover-click -> hoverで開けるようkindがnoneにならない(回帰: 以前はnoneになり、pointer-events:noneでhover自体が無効化されていた)', function() {
		var a11y = resolvePinA11y( pinModel( { hasDescription: true, description: 'desc' } ), 'hover-click', false );
		assert.notStrictEqual( a11y.kind, 'none' );
	} );
	it( 'Descriptionあり・targetなし・hover-click -> フォーカス可能なkind(button)を返す(キーボードでも同等に到達可能にする)', function() {
		var a11y = resolvePinA11y( pinModel( { hasDescription: true, description: 'desc' } ), 'hover-click', false );
		assert.strictEqual( a11y.kind, 'button' );
	} );
	it( 'Descriptionなし・targetなし -> kind=none(何も開閉・遷移する対象が無い)', function() {
		var a11y = resolvePinA11y( pinModel( {} ), 'hover-click', false );
		assert.strictEqual( a11y.kind, 'none' );
	} );
	it( 'Descriptionなし・targetあり -> kind=link(クリックで直接ジャンプ)', function() {
		var a11y = resolvePinA11y( pinModel( { target: 'anchor-1' } ), 'hover-click', false );
		assert.strictEqual( a11y.kind, 'link' );
		assert.strictEqual( a11y.href, '#anchor-1' );
	} );
	it( 'Descriptionあり・targetあり・hover-click -> targetを優先しkind=link(クリック=ジャンプ。hover自体はa11y.kindと無関係にDescriptionの有無だけで動く)', function() {
		var a11y = resolvePinA11y( pinModel( { target: 'anchor-1', hasDescription: true, description: 'desc' } ), 'hover-click', false );
		assert.strictEqual( a11y.kind, 'link' );
	} );
	it( 'Descriptionあり・click-link -> kind=button(Popover開閉。targetの有無に関わらず)', function() {
		var withTarget = resolvePinA11y( pinModel( { target: 'anchor-1', hasDescription: true, description: 'desc' } ), 'click-link', false );
		var withoutTarget = resolvePinA11y( pinModel( { hasDescription: true, description: 'desc' } ), 'click-link', false );
		assert.strictEqual( withTarget.kind, 'button' );
		assert.strictEqual( withoutTarget.kind, 'button' );
	} );
	it( 'Descriptionなし・click-link・targetあり -> kind=link(Popoverに表示するものが無いのでジャンプへフォールバック)', function() {
		var a11y = resolvePinA11y( pinModel( { target: 'anchor-1' } ), 'click-link', false );
		assert.strictEqual( a11y.kind, 'link' );
	} );
} );

describe( 'scene-runtime.js: resolvePinA11y — Editor(editorOverlay=true)', function() {
	it( 'targetもDescriptionも無い新規Pinでもkindはnoneだが、Renderer側はpointer-events:noneにしない(svg-renderer.jsで別途確認済み。ここではkind自体を確認するのみ)', function() {
		var a11y = resolvePinA11y( pinModel( {} ), 'hover-click', true );
		assert.strictEqual( a11y.kind, 'none' );
	} );
	it( 'targetまたはDescriptionのいずれかがあればkind=button(pcBehaviorに関わらず。Editor内はhover非対応、選択+Popover toggleのみ)', function() {
		var withTarget = resolvePinA11y( pinModel( { target: 'anchor-1' } ), 'hover-click', true );
		var withDescription = resolvePinA11y( pinModel( { hasDescription: true, description: 'd' } ), 'click-link', true );
		assert.strictEqual( withTarget.kind, 'button' );
		assert.strictEqual( withDescription.kind, 'button' );
	} );
	it( 'editorOverlay=trueのときはpcBehaviorに関わらずkind=linkを一切返さない(Editor内での実ナビゲーションを避ける)', function() {
		var a11y = resolvePinA11y( pinModel( { target: 'anchor-1' } ), 'click-link', true );
		assert.notStrictEqual( a11y.kind, 'link' );
	} );
} );

module.exports = helper.summary( 'scene-runtime.test.js' );
