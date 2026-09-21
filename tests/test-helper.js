/**
 * Image Pin Block — 最小限のテストヘルパー。
 *
 * npm/ビルドツールを一切使わない構成(プラグイン本体と同じ方針)のため、外部の
 * テストフレームワークは導入しない。Node標準のassertだけを使う、極小のテスト
 * ランナー。1つのテストファイルにつき describe()/it() で構成し、最後に
 * summary()で合否件数を表示してprocess.exitCodeを設定する。
 */
'use strict';

var assert = require( 'assert' );

// 状態(totalPass/totalFail等)をモジュールスコープの共有変数にすると、
// 複数のテストファイルから同じtest-helper.jsをrequire()した場合(Node標準の
// require cacheにより同じインスタンスを共有する)、後発のテストファイルの結果が
// 前のファイルの累積値の上に積み重なってしまう(run-all.js経由での複数ファイル
// 実行時に、各ファイルのsummary()が正しい「そのファイルだけの件数」を返せなくなる
// バグがあった)。createRunner()でテストファイルごとに独立した状態を持たせる。
function createRunner() {
	var totalPass = 0;
	var totalFail = 0;
	var failures = [];
	var currentSuite = '';

	function describe( name, fn ) {
		currentSuite = name;
		fn();
	}

	function it( name, fn ) {
		var label = currentSuite + ' > ' + name;
		try {
			fn();
			totalPass++;
			console.log( '  ✓ ' + label );
		} catch ( err ) {
			totalFail++;
			failures.push( { label: label, error: err } );
			console.log( '  ✗ ' + label );
			console.log( '      ' + err.message );
		}
	}

	function approxEqual( actual, expected, epsilon, message ) {
		epsilon = ( 'number' === typeof epsilon ) ? epsilon : 1e-6;
		if ( Math.abs( actual - expected ) > epsilon ) {
			throw new Error( ( message || 'approxEqual failed' ) + ': expected ' + expected + ', got ' + actual );
		}
	}

	function summary( label ) {
		console.log( '' );
		console.log( '[' + label + '] ' + totalPass + ' passed, ' + totalFail + ' failed' );
		if ( totalFail > 0 ) {
			process.exitCode = 1;
		}
		return { pass: totalPass, fail: totalFail };
	}

	return {
		describe: describe,
		it: it,
		assert: assert,
		approxEqual: approxEqual,
		summary: summary
	};
}

module.exports = createRunner();
module.exports.createRunner = createRunner;
