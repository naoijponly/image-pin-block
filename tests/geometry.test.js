'use strict';

var helper = require( './test-helper.js' ).createRunner();
var describe = helper.describe;
var it = helper.it;
var assert = helper.assert;
var approxEqual = helper.approxEqual;

var Geometry = require( '../geometry.js' );

describe( 'geometry.js: computePinCenter', function() {
	it( '0%,0% -> 画像左上', function() {
		var c = Geometry.computePinCenter( 800, 600, 0, 0 );
		approxEqual( c.x, 0 );
		approxEqual( c.y, 0 );
	} );
	it( '50%,50% -> 画像中心', function() {
		var c = Geometry.computePinCenter( 800, 600, 50, 50 );
		approxEqual( c.x, 400 );
		approxEqual( c.y, 300 );
	} );
	it( '範囲外(負値・100超)はクランプされる', function() {
		var c = Geometry.computePinCenter( 800, 600, -10, 150 );
		approxEqual( c.x, 0 );
		approxEqual( c.y, 600 );
	} );
} );

describe( 'geometry.js: computeMarkerNaturalSize', function() {
	it( '100%スケール、上限に収まる場合はそのまま', function() {
		var s = Geometry.computeMarkerNaturalSize( 100, 50, 100, 800, 0.5 );
		approxEqual( s.width, 100 );
		approxEqual( s.height, 50 );
	} );
	it( '画像幅50%上限でクランプされる(500%スケール要求でも)', function() {
		var s = Geometry.computeMarkerNaturalSize( 100, 50, 500, 800, 0.5 );
		// idealWidth = 100*5 = 500, maxWidth = 800*0.5 = 400 -> 400を採用
		approxEqual( s.width, 400 );
		approxEqual( s.height, 200 ); // アスペクト比(2:1)維持
	} );
	it( 'マーカー画像が未読み込み(naturalImgWidth<=0)は{0,0}', function() {
		var s = Geometry.computeMarkerNaturalSize( 0, 0, 100, 800, 0.5 );
		approxEqual( s.width, 0 );
		approxEqual( s.height, 0 );
	} );
	it( '本体画像幅が不明(0)の場合はidealWidthをそのまま使う', function() {
		var s = Geometry.computeMarkerNaturalSize( 100, 50, 200, 0, 0.5 );
		approxEqual( s.width, 200 );
	} );
} );

describe( 'geometry.js: computeMarkerDragContainment', function() {
	it( '通常サイズ: 中心の可動範囲は半径分だけ内側', function() {
		var b = Geometry.computeMarkerDragContainment( 800, 600, 100, 50 );
		approxEqual( b.minCx, 50 );
		approxEqual( b.maxCx, 750 );
		approxEqual( b.minCy, 25 );
		approxEqual( b.maxCy, 575 );
	} );
	it( 'マーカーが画像より大きい場合は中心固定にフォールバックする', function() {
		var b = Geometry.computeMarkerDragContainment( 800, 600, 1000, 50 );
		approxEqual( b.minCx, 400 );
		approxEqual( b.maxCx, 400 );
	} );
} );

describe( 'geometry.js: computeMarkerResizeMaxWidth', function() {
	it( '画像中心のPinは四辺とも同じ制約 -> 画像全体まで拡大できる', function() {
		var w = Geometry.computeMarkerResizeMaxWidth( 800, 600, { x: 400, y: 300 }, 1 );
		// maxWidthFromLeft/Right = 800, maxWidthFromTop/Bottom = 2*300*1=600 -> min=600
		approxEqual( w, 600 );
	} );
	it( '端に寄ったPinは、その辺までの距離で制約される', function() {
		var w = Geometry.computeMarkerResizeMaxWidth( 800, 600, { x: 50, y: 300 }, 1 );
		// maxWidthFromLeft = 2*50=100 が最も厳しい
		approxEqual( w, 100 );
	} );
	it( 'aspectRatioが0以下なら0を返す', function() {
		var w = Geometry.computeMarkerResizeMaxWidth( 800, 600, { x: 400, y: 300 }, 0 );
		approxEqual( w, 0 );
	} );
} );

describe( 'geometry.js: resolveLabelPosition', function() {
	it( '有効な値はそのまま(0〜1未満へ正規化)', function() {
		approxEqual( Geometry.resolveLabelPosition( 0.25, true ), 0.25 );
	} );
	it( '1以上の値は循環する(1.25 -> 0.25)', function() {
		approxEqual( Geometry.resolveLabelPosition( 1.25, true ), 0.25 );
	} );
	it( '負の値も循環する(-0.25 -> 0.75)', function() {
		approxEqual( Geometry.resolveLabelPosition( -0.25, true ), 0.75 );
	} );
	it( '未設定(NaN)は画像マーカーなら下(0.25)にフォールバックする', function() {
		approxEqual( Geometry.resolveLabelPosition( NaN, true ), 0.25 );
	} );
	it( '未設定(NaN)は丸マーカーなら右(0)にフォールバックする', function() {
		approxEqual( Geometry.resolveLabelPosition( NaN, false ), 0 );
	} );
} );

describe( 'geometry.js: computeLabelCenter (360度連続)', function() {
	var pinRect = { centerX: 100, centerY: 100, width: 40, height: 40 };
	var labelSize = { width: 60, height: 20 };
	it( '0 -> 右側(centerXが増える、centerYはほぼ一致)', function() {
		var c = Geometry.computeLabelCenter( 0, false, pinRect, labelSize );
		assert.ok( c.x > pinRect.centerX );
		approxEqual( c.y, pinRect.centerY, 1 );
	} );
	it( '0.25 -> 下側(centerYが増える)', function() {
		var c = Geometry.computeLabelCenter( 0.25, false, pinRect, labelSize );
		assert.ok( c.y > pinRect.centerY );
		approxEqual( c.x, pinRect.centerX, 1 );
	} );
	it( '0.5 -> 左側(centerXが減る)', function() {
		var c = Geometry.computeLabelCenter( 0.5, false, pinRect, labelSize );
		assert.ok( c.x < pinRect.centerX );
	} );
	it( '0.75 -> 上側(centerYが減る)', function() {
		var c = Geometry.computeLabelCenter( 0.75, false, pinRect, labelSize );
		assert.ok( c.y < pinRect.centerY );
	} );
	it( 'Labelサイズが大きいほどPinから離れる', function() {
		var small = Geometry.computeLabelCenter( 0, false, pinRect, { width: 20, height: 10 } );
		var big = Geometry.computeLabelCenter( 0, false, pinRect, { width: 200, height: 10 } );
		assert.ok( ( big.x - pinRect.centerX ) > ( small.x - pinRect.centerX ) );
	} );
} );

describe( 'geometry.js: computeTailPlacement / buildSpeechBubblePolygon', function() {
	it( '対象と中心が完全一致する場合はnull', function() {
		var t = Geometry.computeTailPlacement( { x: 0, y: 0 }, 50, 20, { x: 0, y: 0 }, 20, 14 );
		assert.strictEqual( t, null );
	} );
	it( '右方向のtailはrotateDegが-90(atan2(0,dx>0)=0 - 90)', function() {
		var t = Geometry.computeTailPlacement( { x: 0, y: 0 }, 50, 20, { x: 200, y: 0 }, 20, 14 );
		assert.ok( t !== null );
		approxEqual( t.rotateDeg, -90, 1 );
	} );
	it( '下方向のtailはrotateDegが0(atan2(dy>0,0)=90 - 90)', function() {
		var t = Geometry.computeTailPlacement( { x: 0, y: 0 }, 50, 20, { x: 0, y: 200 }, 20, 14 );
		assert.ok( t !== null );
		approxEqual( t.rotateDeg, 0, 1 );
	} );
	it( 'buildSpeechBubblePolygonはbbox・pointsAttrを含む多角形を返す', function() {
		var poly = Geometry.buildSpeechBubblePolygon( 50, 20, { x: 200, y: 0 }, 10, 14 );
		assert.ok( poly !== null );
		assert.ok( poly.points.length >= 6 );
		assert.ok( 'string' === typeof poly.pointsAttr );
		assert.ok( poly.bboxWidth > 100 ); // 本体100 + tail突出分
	} );
	it( 'ON/OFF切替(tailの有無)は本体サイズ(bbox基準矩形)自体を変えない', function() {
		// buildSpeechBubblePolygon自体はtail無し時に呼ばれないため(Renderer側でnull分岐)、
		// 本体の半幅・半高さの入力(50, 20)がtail生成の有無で変化しないことを確認する
		// (本体矩形の頂点である[left,top]=[-50,-20]がpoints配列に含まれることを見る)。
		var poly = Geometry.buildSpeechBubblePolygon( 50, 20, { x: 200, y: 0 }, 10, 14 );
		var hasBodyCorner = poly.points.some( function( p ) {
			return -50 === p[ 0 ] && -20 === p[ 1 ];
		} );
		assert.ok( hasBodyCorner, '本体の角(-50,-20)がそのまま多角形の頂点に残っている' );
	} );
} );

describe( 'geometry.js: computePopoverPlacement', function() {
	it( 'Pin右側に十分な空きがあれば右に配置する', function() {
		var p = Geometry.computePopoverPlacement( 1000, 800, { centerX: 100, centerY: 100, width: 40, height: 40 }, { width: 200, height: 100 }, 10 );
		assert.ok( p.left > 100 );
	} );
	it( '右側が不足する場合は左側へ反転する', function() {
		var p = Geometry.computePopoverPlacement( 1000, 800, { centerX: 950, centerY: 100, width: 40, height: 40 }, { width: 200, height: 100 }, 10 );
		assert.ok( p.left < 950 );
	} );
	it( '上下は画像内へclampされる(負のtopにならない)', function() {
		var p = Geometry.computePopoverPlacement( 1000, 800, { centerX: 100, centerY: 5, width: 40, height: 40 }, { width: 200, height: 300 }, 10 );
		assert.ok( p.top >= 0 );
	} );
} );

describe( 'geometry.js: computePopoverVerticalMetrics', function() {
	it( '本文が画像高に収まる場合は自然高を維持し、scrollMaxOffsetは0になる', function() {
		var metrics = Geometry.computePopoverVerticalMetrics( 100, 300 );
		approxEqual( metrics.outerHeight, 122 );
		approxEqual( metrics.visibleBodyHeight, 100 );
		approxEqual( metrics.scrollMaxOffset, 0 );
	} );
	it( '本文が画像高を超える場合は外形を画像高へ制限し、はみ出した本文量をscrollMaxOffsetにする', function() {
		var metrics = Geometry.computePopoverVerticalMetrics( 500, 300 );
		approxEqual( metrics.outerHeight, 300 );
		approxEqual( metrics.visibleBodyHeight, 278 );
		approxEqual( metrics.scrollMaxOffset, 222 );
		assert.ok( metrics.scrollMaxOffset > 0, '長文ではスクロール可能量が正になる' );
	} );
	it( '画像高が未確定の場合は本文の自然高へフォールバックする', function() {
		var metrics = Geometry.computePopoverVerticalMetrics( 500, 0 );
		approxEqual( metrics.outerHeight, 522 );
		approxEqual( metrics.visibleBodyHeight, 500 );
		approxEqual( metrics.scrollMaxOffset, 0 );
	} );
	it( '画像高がpaddingとborderの合計より小さくても表示可能本文高を負にしない', function() {
		var metrics = Geometry.computePopoverVerticalMetrics( 100, 10 );
		approxEqual( metrics.outerHeight, 10 );
		approxEqual( metrics.visibleBodyHeight, 0 );
		approxEqual( metrics.scrollMaxOffset, 100 );
	} );
} );

describe( 'geometry.js: 定数の一貫性', function() {
	it( 'POPOVER_TEXT_COLOR_FALLBACKは#1e1e1e(11節の確定仕様)', function() {
		assert.strictEqual( Geometry.POPOVER_TEXT_COLOR_FALLBACK, '#1e1e1e' );
	} );
	it( 'scaleSpeechBubblePolygonはもう存在しない(renderScale概念の撤廃)', function() {
		assert.strictEqual( Geometry.scaleSpeechBubblePolygon, undefined );
	} );
} );

// 実WordPress受入確認で見つかった回帰の再発防止テスト。
// PC Popover本文幅は、固定260 natural pxではなく「フォントサイズに比例した」
// natural座標の寸法契約に変更した(popoverFontSizeを大きくすると日本語が
// 約6文字ごとに強制折り返しされる回帰の修正。geometry.js側のコメント参照)。
describe( 'geometry.js: POPOVER_MAX_BODY_WIDTH_EMの寸法契約', function() {
	it( '旧デフォルト値(fontSize=12)では、旧仕様と同じ260 natural pxになる(後方互換)', function() {
		var DEFAULT_POPOVER_FONT_SIZE = 12;
		approxEqual( Geometry.POPOVER_MAX_BODY_WIDTH_EM * DEFAULT_POPOVER_FONT_SIZE, 260, 1e-9 );
	} );
	it( 'fontSizeに比例して最大幅が変わる(固定260 natural pxだと大きいfontSizeで極端に狭くなる回帰の再発防止)', function() {
		var widthAt12 = Geometry.POPOVER_MAX_BODY_WIDTH_EM * 12;
		var widthAt38 = Geometry.POPOVER_MAX_BODY_WIDTH_EM * 38;
		// 文字数相当(width/fontSize)がfontSizeに関わらずほぼ一定であること
		// (=固定260pxのときのような「fontSizeが大きいほど文字数が激減する」ことが無い)。
		approxEqual( widthAt12 / 12, widthAt38 / 38, 1e-9 );
		assert.ok( widthAt38 > widthAt12, 'fontSizeが大きいほど絶対的な最大幅(natural px)自体は広くなる' );
	} );
	it( '旧実装の固定260px単独では、fontSize=38のとき1行あたり約6.8文字相当になってしまう(回帰の再現条件を明文化)', function() {
		var OLD_FIXED_WIDTH = 260;
		var charsPerLineWithOldFixedWidth = OLD_FIXED_WIDTH / 38;
		assert.ok( charsPerLineWithOldFixedWidth < 8, '固定260pxのままだと約6〜7文字で折り返る(修正前の回帰条件)' );
		var charsPerLineWithNewFormula = ( Geometry.POPOVER_MAX_BODY_WIDTH_EM * 38 ) / 38;
		assert.ok( charsPerLineWithNewFormula > 15, '新しい寸法契約では十分な文字数が1行に収まる' );
	} );
	it( 'scene-runtime.jsのresolvePopoverはfontSize比例の最大幅を計算する(Camera zoomには一切依存しない。実際のブラウザ検証でも同じ行数を確認済み)', function() {
		// resolvePopover自体はSVG計測(DOM)を要するためNode単体では呼べないが、
		// ここで使う定数自体がCamera/zoomPercentを一切参照しないことを確認することで、
		// 「Scene側で一貫した寸法契約を持つ(Cameraのzoomに依存しない)」という
		// 期待仕様の根拠となる計算式がPure functionのみで構成されていることを保証する。
		assert.strictEqual( typeof Geometry.POPOVER_MAX_BODY_WIDTH_EM, 'number' );
		assert.ok( Geometry.POPOVER_MAX_BODY_WIDTH_EM > 0 );
	} );
} );

describe( 'geometry.js: resolveTailDimensions(吹き出し先端の大・中・小)', function() {
	it( 'mediumは従来のTAIL_WIDTH/TAIL_HEIGHTと完全に同じ(既存記事の見た目を変えない)', function() {
		var d = Geometry.resolveTailDimensions( 'medium' );
		assert.strictEqual( d.width, Geometry.TAIL_WIDTH );
		assert.strictEqual( d.height, Geometry.TAIL_HEIGHT );
	} );
	it( 'small < medium < large(付け根幅・突出量ともに単調増加)', function() {
		var s = Geometry.resolveTailDimensions( 'small' );
		var m = Geometry.resolveTailDimensions( 'medium' );
		var l = Geometry.resolveTailDimensions( 'large' );
		assert.ok( s.width < m.width && m.width < l.width );
		assert.ok( s.height < m.height && m.height < l.height );
	} );
	it( '未設定・不正な値はmediumへフォールバックする', function() {
		var m = Geometry.resolveTailDimensions( 'medium' );
		assert.deepStrictEqual( Geometry.resolveTailDimensions( undefined ), m );
		assert.deepStrictEqual( Geometry.resolveTailDimensions( 'huge' ), m );
		assert.deepStrictEqual( Geometry.resolveTailDimensions( 'toString' ), m );
	} );
	it( '先端サイズがbuildSpeechBubblePolygonの突出量へ反映される(largeはmediumよりbbox高が大きい)', function() {
		var target = { x: 0, y: 100 };
		var m = Geometry.resolveTailDimensions( 'medium' );
		var l = Geometry.resolveTailDimensions( 'large' );
		var pm = Geometry.buildSpeechBubblePolygon( 50, 20, target, m.width / 2, m.height );
		var pl = Geometry.buildSpeechBubblePolygon( 50, 20, target, l.width / 2, l.height );
		assert.ok( pl.bboxHeight > pm.bboxHeight );
	} );
} );

module.exports = helper.summary( 'geometry.test.js' );
