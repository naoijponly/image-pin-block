/**
 * Image Pin Block — 共通Text Layout / SVG Measurementモジュール。
 *
 * Label・PC Popoverの文字レイアウト(改行決定・計測)を、この1ファイルへ集約する。
 * profile(font-family/size/weight/letter-spacing/line-height/padding/wrap有無/
 * 最大幅)だけをLabel/Popoverで分け、改行・計測の実装そのものは複製しない
 * (14節: 「Label用計測とPopover用計測を別実装にしないこと」)。
 *
 * ─── 責務の境界 ───
 * このファイルは、DOM上のSVG(<text>/<tspan>のgetComputedTextLength())を使った
 * 「文字幅の実測」と、その実測結果を使った「改行位置の決定」だけを行う。
 * Canvas 2DのmeasureText()は使わない(15節)。Geometry(Pin/Label中心・Popover配置)・
 * Asset解決・Rendererの描画自体は一切行わない(scene-runtime.js/svg-renderer.js側)。
 *
 * ─── SVG Measurement Context ───
 * ownerDocumentごとに、非表示(display:noneではなくposition:fixedで画面外へ
 * 配置。15節: 「display:none前提にしない」)のSVG measurement用要素を1つだけ
 * 作成し、WeakMap<ownerDocument, MeasurementContext>でキャッシュする
 * (16節: Editor iframeと親documentで別のMeasurement Contextを使う)。
 *
 * ─── 改行アルゴリズム(概要) ───
 * 1. CRLF/CR→LFへ正規化し、\nで段落へ分割する(空段落=空行として保持)。
 * 2. wrap:false(Label)の段落は、幅に関わらずそのまま1行として扱う(現行nowrap維持)。
 * 3. wrap:true(Popover)の段落は、Intl.Segmenter(利用不可環境ではUTF-16
 *    コードポイント単位)でgrapheme cluster(結合文字・異体字セレクタ・emoji ZWJ
 *    sequenceを1単位として扱う)へ分割し、cluster境界ごとに「break可能かどうか」を
 *    判定する(日本語禁則(始め括弧の直後・終わり括弧等の直前で改行しない)、
 *    CJK文字は概ね任意の境界で改行可能、ラテン文字・数字・URL等の「語」は
 *    語の境界(空白・CJKとの境界・禁則対象の句読点等)以外では改行しない)。
 * 4. 各行の候補は、1文字ずつの幅の合計ではなく候補行全体をSVGで実測して決める
 *    (kerning/shapingを壊さないため。15節)。二分探索でmaxWidthに収まる最長の
 *    候補を求め、break可能な境界まで後退する。境界が1つも無い語(長いURL等)が
 *    それ単独でmaxWidthを超える場合だけ、grapheme境界での緊急折り返しを行う。
 *
 * 完全なUnicode UAX #14準拠を主張するものではなく、実務上必要な範囲
 * (日本語・英語・混在・主要な禁則・emoji ZWJ・結合文字・異体字セレクタ・長い
 * 英数字/URLの緊急折り返し)を満たす、この用途に絞った実装であることを明記する。
 */
( function( root, factory ) {
	'use strict';
	var api = factory();
	if ( 'undefined' !== typeof module && module.exports ) {
		module.exports = api;
	}
	if ( root ) {
		root.ImagePinBlockSceneText = api;
	}
} )(
	( 'undefined' !== typeof window ) ? window : ( ( 'undefined' !== typeof global ) ? global : null ),
	function() {
		'use strict';

		var SVG_NS = 'http://www.w3.org/2000/svg';

		// 各行のbaseline位置を、行の内容に関わらず一定に保つための比率
		// (lineHeightに対するascent相当の比率。15節「行ごとの文字内容で上下に
		// 揺れないようにする」)。実際のfont metricsを厳密に読み取るAPIはSVG/CSSに
		// 無いため、UI用フォントで一般的な近似値を固定値として使う(Renderer側が
		// 各行のY座標=lineTopY + fontSize*BASELINE_RATIOとして使うことを想定)。
		var BASELINE_RATIO = 0.8;

		// ─── 改行・段落分割 ───

		function normalizeNewlines( text ) {
			return String( text || '' ).replace( /\r\n/g, '\n' ).replace( /\r/g, '\n' );
		}

		var HAS_SEGMENTER = ( 'undefined' !== typeof Intl ) && !! Intl.Segmenter;

		// grapheme cluster単位の分割(結合文字・異体字セレクタ・emoji ZWJ sequence等を
		// 1単位として扱う)。Intl.Segmenter利用不可の環境では、サロゲートペアを
		// 崩さないコードポイント単位の分割へfallbackする(結合文字列の完全な安全性は
		// 保証しないが、Intl.Segmenter未対応の古い環境向けの最終手段として許容する)。
		function segmentGraphemes( text ) {
			if ( ! text ) {
				return [];
			}
			if ( HAS_SEGMENTER ) {
				try {
					var segmenter = new Intl.Segmenter( undefined, { granularity: 'grapheme' } );
					return Array.prototype.map.call( Array.from( segmenter.segment( text ) ), function( entry ) {
						return entry.segment;
					} );
				} catch ( e ) {
					// 何らかの理由で失敗した場合はfallbackへ進む。
				}
			}
			var out = [];
			var re = /[\uD800-\uDBFF][\uDC00-\uDFFF]|[\s\S]/g;
			var m;
			while ( ( m = re.exec( text ) ) !== null ) {
				out.push( m[ 0 ] );
			}
			return out;
		}

		function isWhitespaceCluster( cluster ) {
			return /^\s+$/.test( cluster );
		}

		// CJK判定(Hiragana/Katakana/CJK統合漢字(拡張含む)/CJK互換漢字/Hangul)。
		// grapheme clusterの先頭コードポイントで判定する(結合文字が付いていても
		// 基底文字の種別で分類する)。
		function isCjkCluster( cluster ) {
			if ( ! cluster ) {
				return false;
			}
			var cp = cluster.codePointAt( 0 );
			if ( 'undefined' === typeof cp ) {
				return false;
			}
			return ( cp >= 0x3040 && cp <= 0x30FF )
				|| ( cp >= 0x3400 && cp <= 0x9FFF )
				|| ( cp >= 0xF900 && cp <= 0xFAFF )
				|| ( cp >= 0xAC00 && cp <= 0xD7A3 )
				|| ( cp >= 0x20000 && cp <= 0x2FFFF );
		}

		// 日本語禁則(簡易版。JIS X 4051相当の主要な規則のみ): 単一コードポイントの
		// 句読点・閉じ括弧・小書き文字等の直前では改行しない(NO_BREAK_BEFORE)。
		// 単一コードポイントの開き括弧の直後では改行しない(NO_BREAK_AFTER)。
		// 完全な規則表の実装ではなく、実務上よく使われる範囲に絞っている。
		var NO_BREAK_BEFORE = '、。，．,.・:;：；」』）)]｝}!?!?ゝゞーぁぃぅぇぉっゃゅょァィゥェォッャュョヮヵヶ";\'’”';
		var NO_BREAK_AFTER = '「『（([｛{“‘"\'';

		function isInSingleCharSet( cluster, setStr ) {
			return 1 === cluster.length && setStr.indexOf( cluster ) !== -1;
		}

		// clusters[i]とclusters[i+1]の間で改行してよいかどうかの配列
		// (長さ = clusters.length - 1)を返す。
		function computeBreakOpportunities( clusters ) {
			var n = clusters.length;
			var allowed = [];
			for ( var i = 0; i < n - 1; i++ ) {
				var cur = clusters[ i ];
				var next = clusters[ i + 1 ];
				var ok;
				if ( isWhitespaceCluster( cur ) || isWhitespaceCluster( next ) ) {
					ok = true;
				} else if ( isCjkCluster( cur ) || isCjkCluster( next ) ) {
					ok = true;
				} else {
					// 両方とも非空白・非CJK(ラテン文字・数字・URL等の「語」の内部)。
					ok = false;
				}
				if ( ok ) {
					if ( isInSingleCharSet( next, NO_BREAK_BEFORE ) ) {
						ok = false;
					}
					if ( isInSingleCharSet( cur, NO_BREAK_AFTER ) ) {
						ok = false;
					}
				}
				allowed.push( ok );
			}
			return allowed;
		}

		// ─── SVG Measurement Context ───

		var contextsByDocument = ( 'undefined' !== typeof WeakMap ) ? new WeakMap() : null;
		var fallbackContexts = []; // WeakMap非対応の極めて古い環境向けの最終手段。

		function findFallbackContext( ownerDocument ) {
			for ( var i = 0; i < fallbackContexts.length; i++ ) {
				if ( fallbackContexts[ i ].ownerDocument === ownerDocument ) {
					return fallbackContexts[ i ].ctx;
				}
			}
			return null;
		}

		function createMeasurementContext( ownerDocument ) {
			var svg = ownerDocument.createElementNS( SVG_NS, 'svg' );
			svg.setAttribute( 'aria-hidden', 'true' );
			svg.setAttribute( 'width', '1' );
			svg.setAttribute( 'height', '1' );
			// display:noneはgetComputedTextLength()を使えなくするため使わない
			// (15節)。文書に接続したまま、画面外へ位置だけずらす。
			svg.style.position = 'fixed';
			svg.style.left = '-99999px';
			svg.style.top = '0px';
			svg.style.width = '1px';
			svg.style.height = '1px';
			svg.style.overflow = 'hidden';
			svg.style.pointerEvents = 'none';
			var text = ownerDocument.createElementNS( SVG_NS, 'text' );
			var tspan = ownerDocument.createElementNS( SVG_NS, 'tspan' );
			text.appendChild( tspan );
			svg.appendChild( text );
			var mountPoint = ownerDocument.body || ownerDocument.documentElement;
			mountPoint.appendChild( svg );
			return { svg: svg, text: text, tspan: tspan, ownerDocument: ownerDocument };
		}

		// ownerDocumentごとに測定用SVGを1つだけ作成・再利用する(16節)。
		function getMeasurementContext( ownerDocument ) {
			if ( ! ownerDocument ) {
				return null;
			}
			if ( contextsByDocument ) {
				var cached = contextsByDocument.get( ownerDocument );
				if ( cached ) {
					return cached;
				}
			} else {
				var fallbackCached = findFallbackContext( ownerDocument );
				if ( fallbackCached ) {
					return fallbackCached;
				}
			}
			var ctx = createMeasurementContext( ownerDocument );
			if ( contextsByDocument ) {
				contextsByDocument.set( ownerDocument, ctx );
			} else {
				fallbackContexts.push( { ownerDocument: ownerDocument, ctx: ctx } );
			}
			return ctx;
		}

		function applyFont( el, fontProps ) {
			el.style.fontFamily = fontProps.fontFamily;
			el.style.fontSize = fontProps.fontSize + 'px';
			el.style.fontWeight = fontProps.fontWeight || 'normal';
			el.style.fontStyle = fontProps.fontStyle || 'normal';
			el.style.letterSpacing = ( fontProps.letterSpacing && 'normal' !== fontProps.letterSpacing ) ? fontProps.letterSpacing : 'normal';
			el.style.whiteSpace = 'pre';
		}

		// 文字列1本(改行を含まない)の実際の幅(natural px)を、
		// getComputedTextLength()で実測する。空文字は0を即答する
		// (getComputedTextLength()を空tspanに対して呼ぶと環境によって例外・0以外を
		// 返す場合があるため)。
		function measureRun( ctx, str, fontProps ) {
			if ( ! ctx || ! str ) {
				return 0;
			}
			applyFont( ctx.tspan, fontProps );
			ctx.tspan.textContent = str;
			try {
				return ctx.tspan.getComputedTextLength();
			} catch ( e ) {
				return 0;
			}
		}

		// ─── 改行位置の決定 ───

		function trimTrailingWhitespace( clusters, start, end ) {
			while ( end > start && isWhitespaceCluster( clusters[ end - 1 ] ) ) {
				end--;
			}
			return end;
		}

		function skipLeadingWhitespace( clusters, start, end ) {
			while ( start < end && isWhitespaceCluster( clusters[ start ] ) ) {
				start++;
			}
			return start;
		}

		// [start, n)の範囲で、maxWidthに収まる最大のend(break境界を考慮する前の
		// 「収まる」だけの生の終端)を二分探索で求め、その範囲内の最後のbreak可能位置まで
		// 後退する。break可能位置が無ければ(語全体がmaxWidthを超える等)、収まる範囲の
		// 終端(緊急折り返し)をそのまま採用する。1文字も収まらない場合は、無限ループを
		// 避けるため最低1文字を強制的に進める。
		function findLineEnd( ctx, clusters, start, breakOpportunities, fontProps, maxWidth ) {
			var n = clusters.length;
			if ( start >= n ) {
				return start;
			}
			var lo = start + 1;
			var hi = n;
			var maxFit = start;
			while ( lo <= hi ) {
				var mid = Math.floor( ( lo + hi ) / 2 );
				var candidate = clusters.slice( start, mid ).join( '' );
				var w = measureRun( ctx, candidate, fontProps );
				if ( w <= maxWidth || mid === start + 1 ) {
					// mid === start + 1 の分岐: 1文字だけでもmaxWidthを超える場合、
					// それでも最低1文字は必ず確定させる(緊急折り返し)。
					maxFit = mid;
					lo = mid + 1;
				} else {
					hi = mid - 1;
				}
			}
			if ( maxFit >= n ) {
				return n;
			}
			// maxFitから後退して、実際に改行可能な境界を探す。境界が1つも見つからずに
			// start+1まで後退してしまった場合(語全体・長いURL等にbreak可能点が無い)は、
			// 1文字ずつの行になってしまわないよう、後退せずmaxFit(収まる範囲の終端。
			// 緊急折り返し)をそのまま採用する(この判定を後退ループの終了条件だけで
			// 行うと、「start+1まで後退した」= 「start+1自体が改行可能点だった」のか
			// 「境界が無かったのでfloorに達した」のかを区別できず、後者もbreak可能点と
			// 誤認して1文字ずつの行になってしまうバグがあった)。
			var end = maxFit;
			var foundBreak = false;
			while ( end > start + 1 ) {
				if ( breakOpportunities[ end - 1 ] ) {
					foundBreak = true;
					break;
				}
				end--;
			}
			if ( ! foundBreak ) {
				end = maxFit;
			}
			return end;
		}

		function breakParagraph( ctx, paragraphText, fontProps, maxWidth ) {
			var clusters = segmentGraphemes( paragraphText );
			if ( 0 === clusters.length ) {
				return [ '' ];
			}
			var opportunities = computeBreakOpportunities( clusters );
			var lines = [];
			var pos = 0;
			var n = clusters.length;
			var guard = 0;
			while ( pos < n && guard < n + 10 ) {
				guard++;
				var end = findLineEnd( ctx, clusters, pos, opportunities, fontProps, maxWidth );
				var trimmedEnd = trimTrailingWhitespace( clusters, pos, end );
				lines.push( clusters.slice( pos, trimmedEnd ).join( '' ) );
				var nextPos = skipLeadingWhitespace( clusters, end, n );
				pos = ( nextPos > pos ) ? nextPos : end;
				if ( pos <= 0 && end <= 0 ) {
					break;
				}
			}
			return lines;
		}

		// text: 生の文字列(CRLF/CR/LF・空行を含んでよい)。profile: {
		//   fontFamily, fontSize(natural px), fontWeight, fontStyle, letterSpacing,
		//   lineHeight(fontSizeに対する比率。例1.4), wrap(bool), maxWidth(natural px。
		//   wrap=trueのときのみ使う)
		// }。戻り値: {
		//   lines: [ { text, width(natural px) } ], lineHeight(natural px),
		//   width(全行中の最大natural px), height(lines.length * lineHeight)
		// }
		function layoutText( ctx, text, profile ) {
			var normalized = normalizeNewlines( text );
			var paragraphs = normalized.split( '\n' );
			var fontProps = {
				fontFamily: profile.fontFamily,
				fontSize: profile.fontSize,
				fontWeight: profile.fontWeight,
				fontStyle: profile.fontStyle,
				letterSpacing: profile.letterSpacing
			};
			var allLines = [];
			paragraphs.forEach( function( paragraph ) {
				if ( profile.wrap ) {
					breakParagraph( ctx, paragraph, fontProps, profile.maxWidth ).forEach( function( l ) {
						allLines.push( l );
					} );
				} else {
					allLines.push( paragraph );
				}
			} );
			if ( 0 === allLines.length ) {
				allLines = [ '' ];
			}
			var maxLineWidth = 0;
			var resolvedLines = allLines.map( function( lineText ) {
				var w = measureRun( ctx, lineText, fontProps );
				if ( w > maxLineWidth ) {
					maxLineWidth = w;
				}
				return { text: lineText, width: w };
			} );
			var lineHeight = profile.fontSize * ( profile.lineHeight || 1 );
			return {
				lines: resolvedLines,
				lineHeight: lineHeight,
				width: maxLineWidth,
				height: lineHeight * resolvedLines.length
			};
		}

		// ownerDocumentのfont読み込み完了を待つ(16節: 最終Text Layoutはfont ready後に
		// 確定させる)。document.fonts未対応環境ではすぐに解決する。
		function waitForFonts( ownerDocument ) {
			if ( ownerDocument && ownerDocument.fonts && ownerDocument.fonts.ready ) {
				return ownerDocument.fonts.ready.then( function() {
					return true;
				} ).catch( function() {
					return true;
				} );
			}
			return Promise.resolve( true );
		}

		return {
			BASELINE_RATIO: BASELINE_RATIO,
			normalizeNewlines: normalizeNewlines,
			segmentGraphemes: segmentGraphemes,
			getMeasurementContext: getMeasurementContext,
			measureRun: measureRun,
			layoutText: layoutText,
			waitForFonts: waitForFonts
		};
	}
);
