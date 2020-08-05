/*
 * @Author: CoyoteWaltz <coyote_waltz@163.com>
 * @Date: 2020-08-02 14:20:53
 * @LastEditTime: 2020-08-05 21:46:51
 * @LastEditors: CoyoteWaltz <coyote_waltz@163.com>
 * @Description: realization of matching strategy
 * @TODO: 异步的去做这个逻辑 还是 配置化？
 */
const { scan } = require('../search');
const { parseFullPath } = require('../store/endpoint.js');
const { traceProbe } = require('../search.js');

const fs = require('fs');
const { probe } = require('../probe.js');
const logger = require('../util/log');

// 开始 scan usualList
//   找到结果是 endpoint -> 送去 parse -> 送去 fire
//   为空 -> 去 endpoints 去 scan

function handleTrace(traceRes, state) {
  state.newDepth = traceRes.addition.probeDepth;
  state.newPrefixes = traceRes.addition.prefixes;
  state.newEndpoints = traceRes.addition.endpoints;
  state.updatePath = traceRes.addition.updatePath;
  const results = traceRes.results;
  if (results.length && preFire(results, state.newPrefixes)) {
    logger.info('回溯成功!!');
    state.results = results;
    return true;
  }
  return false;
}
/**
 *
 * @param {string} target
 * @returns {object} state
 */
function match(target) {
  const store = require('../store');
  const state = {
    inUsual: false,
    newDepth: -1,
    newPrefixes: [],
    newEndpoints: [],
    results: [],
    updatePath: '',
  };
  let results = scan(target, store.usualList);
  if (results.length) {
    // ul 有匹配结果
    if (preFire(results)) {
      // 不用更新
      state.inUsual = true;
      state.results = results;
      return state;
    } else {
      // 路径不存在
      logger.err('ul 中 路径不存在');
      const traceRes = traceProbe(target, parseFullPath(results[0]), store);
      // 回溯成功 这里路径必然存在 更新 store.prefix store.endpoints
      // traceRes.addition
      // 处理 增量
      if (handleTrace(traceRes, state)) {
        return state;
      }
      // 回溯失败 则落到这个 if 之外
    }
  } else {
    // 未匹配到 去 endpoints 匹配
    logger.err('未匹配到 去 endpoints 匹配');
    results = scan(target, store.endpoints);
    if (results.length) {
      // 匹配成功
      if (preFire(results)) {
        // 路径存在 移入 ul
        state.results = results;

        return state;
      }
      logger.err('ep 中 路径不存在');
      // 路径不存在 TODO 这里和上面一样了
      const traceRes = traceProbe(target, parseFullPath(results[0]), store);
      // 回溯成功 更新 store.prefix store.endpoints
      // traceRes.addition
      // 处理 增量
      if (handleTrace(traceRes, state)) {
        return state;
      }
    } else {
      // 匹配失败 从 root 全量更新
      logger.err('匹配失败 从 root 全量更新');
      const traceRes = traceProbe(target, store.root, store);
      // 路径存在 这里路径必须存在
      if (handleTrace(traceRes, state)) {
        return state;
      }
      // 全量失败 则落到这个 if 之外
    }
  }
  logger.err('oops 此时是 trace 之后 或者 endpoints 中 scan 之后');

  // oops 此时是 trace 之后 或者 endpoints 中 scan 之后
  // 这两者都失败了 但是 trace 已经更新了全部
  // 此时 对于 所有的 增量 endpoints 都进行 深入 infinity
  console.log('nooooo: ', state.newEndpoints.length);
  if (state.newEndpoints.length) {
    for (const endpoint of state.newEndpoints.slice()) {
      const fullPath = parseFullPath(endpoint, state.newPrefixes);
      
      const { endpoints: newEps, probeDepth } = probe(
        fullPath,
        Infinity,
        state.newPrefixes
      );
      // console.log(newEps.map((v) => v.fullPath));
      results = scan(target, newEps);
      // console.log(results.length);
      state.newEndpoints.push(...newEps);
      if (results.length) {
        // logger
        //   .info('yes yes yes ')
        //   .info(results)
        //   .info(parseFullPath(results[0]));
        // console.log(store.prefixes.map((v, i) => `${i}  ${v}`));
        state.results = results;
        state.newDepth += probeDepth;
        // return;
      }
    }
  }
  // return augmented;
  return state;
}
// 放到外面去做
// 更新 store 的 currentDepth prefixes endpoints usualList

// 如果结果有多个路径 过滤一遍存在的路径 如果数量仍 > 1 提示用户选择 TODO
/**
 *
 * @param {Array} results endpoints[]
 */
function preFire(results, prefixes) {
  console.log(results);
  const fullPaths = results
    .map((ep) => parseFullPath(ep, prefixes))
    .filter((p) => fs.existsSync(p));
  if (fullPaths.length >= 1) {
    // TODO
    console.log('yes! fire! ', fullPaths);
    return true;
  }
  return false;
}

module.exports = match;
