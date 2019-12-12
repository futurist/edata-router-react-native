import forEach from 'lodash/forEach'
import set from 'lodash/set'
import qs from 'qs'
import edata, { EdataBaseClass } from 'edata'
import isPOJO from 'is-plain-obj'
import pathToRegexp from 'path-to-regexp'

// import 'url-polyfill'
import 'abortcontroller-polyfill/dist/abortcontroller-polyfill-only'
import { fetch, Headers, Request, Response } from 'react-native/Libraries/Network/fetch'

import { parse as parseResponse } from './fetch-parse'
import MediaType from 'medium-type'
const WILDCARD_PARSER = [[new MediaType('*/*'), null]]

export function noop() {}

export function isFunction(e) {
  return typeof e === 'function'
}

export function joinPath(prev, url) {
  prev = prev || ''
  if (url[0] != '/') url = '/' + url
  if (prev[prev.length - 1] == '/') prev = prev.slice(0, -1)
  return prev + url
}

// use native browser implementation if it supports aborting
const abortableFetch = 'signal' in new Request('') ? window.fetch : fetch

const defaultHeaders = {
  'Content-Type': 'application/json; charset=utf-8',
}

const defaultReplaceParams = { encode: noop }
function replaceParams(url, params, options) {
  return pathToRegexp.compile(url)(params || {}, options)
}

export function parseUrlPart(url) {
  const [part1, hash = ''] = url.split('#')
  const [part2, query = ''] = part1.split('?')
  const [, protocol = '', host = '', pathname] = part2.match(/^(\w+:)?(\/\/[\w\d\-\.:]+)?(.*)$/)
  return {
    protocol,
    host,
    pathname,
    query,
    hash,
  }
}
// console.log(parseUrlPart('http://10.0.2.2:8081/playground/index.bundle?platform=android&dev=true&minify=false'))

export function joinUrlPart(obj) {
  const { protocol = '', host = '', pathname = '', query = '', hash = '' } = obj
  return protocol + host + pathname + (query ? '?' + query : '') + (hash ? '#' + hash : '')
}

function defaultGetResponse(response) {
  return parseResponse(WILDCARD_PARSER, response)
}

function identity(res) {
  return res
}

function debugErrorHandler(err) {
  if (err.name === 'AbortError') {
    console.log('request aborted')
  }
  console.log(err)
}

function unwrapEData(edata) {
  while (edata instanceof EdataBaseClass) {
    edata = edata.value
  }
  return edata
}

export const globalAjaxSetting = {
  headers: defaultHeaders,
  beforeRequest: identity,
  getResponse: defaultGetResponse,
  afterResponse: identity,
  errorHandler: null,
}

export function makeAPI(model, res) {
  const namespace = model.name || model.displayName
  if (!namespace) {
    throw `model should have .name or .displayName: ${JSON.stringify(model)}`
  }
  return data => {
    data = data || {}
    data._store = data._store || {}
    data._actions = data._actions || {}
    data._api = data._api || {}
    data._store[namespace] = new EdataBaseClass({
      ...model.store,
      ...unwrapEData(data._store[namespace]),
    })
    data._actions[namespace] = new EdataBaseClass({
      ...model.actions,
      ...unwrapEData(data._actions[namespace]),
    })
    forEach(res, (value, key) => {
      set(data._api, [namespace, key], value)
    })
    const apis = data._api[namespace] || {}
    forEach(model.actions, (value, key) => {
      if (!(key in apis)) {
        set(data._api, [namespace, key], {})
      }
    })
    return data
  }
}

export function initModel(config, unwrapOptions) {
  return data =>
    edata(data, {
      unwrapConfig: unwrapAPI(unwrapOptions),
      ...config,
    })
}

const REGEX_HTTP_PROTOCOL = /^(https?:)?\/\//i

export function unwrapAPI(unwrapOptions = {}) {
  const { paramStyle, queryKey, mockKey, debug } = unwrapOptions
  const ajaxSetting = { ...globalAjaxSetting, ...unwrapOptions.ajaxSetting }

  return packer => {
    if (!packer) return
    const { path, root } = packer
    const model = root
    const [prefix, name, service] = path
    if (prefix == '_api' && path.length === 3) {
      return {
        map: apiConfig => {
          return (query, options = {}) =>
            Promise.resolve(isFunction(apiConfig) ? apiConfig() : apiConfig).then(apiConfig => {
              options = options || {}
              const actions = model.unwrap(['_actions', name]) || {}
              const store = model.unwrap(['_store', name]) || {}
              const actionConfig = { ...ajaxSetting, ...(actions[service] || {}) }
              let {
                exec,
                reducer,
                callback,
                timeout,
                headers,
                beforeRequest,
                getResponse,
                afterResponse,
                errorHandler,
              } = actionConfig
              let base = actionConfig.base || actions.base
              if (debug && !errorHandler) {
                errorHandler = debugErrorHandler
              }
              if (typeof exec === 'string') {
                exec = model.unwrap(['_api', name, exec], {
                  map: v => v,
                })
              }
              if (!exec) exec = { ...actionConfig, ...apiConfig }
              const success =
                (callback && callback.success) ||
                (reducer && reducer.success) ||
                callback ||
                reducer
              const start = (callback && callback.start) || (reducer && reducer.start)
              const fail = (callback && callback.fail) || (reducer && reducer.fail)
              const onSuccess = args => {
                if (success) {
                  let ret = success(store, args)
                  if (ret === false) {
                    return Promise.resolve(args)
                  }
                  return Promise.resolve(ret).then(ret => {
                    ret = Object.assign(store, ret)
                    model.set(['_store', name], model.of(store))
                    return ret
                  })
                } else {
                  return Promise.resolve(args)
                }
              }
              const onFail = (err = new Error()) => {
                err.isTimeout = isTimeout
                err.init = init
                clearTimeout(timeoutId)
                isFunction(errorHandler) && errorHandler(err)
                if (fail) {
                  const ret = fail(store, err)
                  if (ret === false) {
                    return Promise.reject(err)
                  }
                  return Promise.resolve(ret).then(ret => {
                    ret = Object.assign(store, ret)
                    model.set(['_store', name], model.of(store))
                    return ret
                  })
                } else {
                  return Promise.reject(err)
                }
              }
              if (!exec.url) {
                return onSuccess({ data: query })
              }

              let mock = exec[mockKey]
              let param = exec[queryKey]
              if (isFunction(param)) {
                param = param()
              }
              const method = String(exec.method || 'get').toUpperCase()
              const hasBody = /PUT|POST|PATCH/.test(method)
              const urlParam = paramStyle === 'beatle' ? options.params : options
              const urlObj = parseUrlPart(exec.url)
              urlObj.pathname = replaceParams(
                urlObj.pathname,
                ...(paramStyle === 'beatle' ? [options.params, options.options] : [options]),
              )
              let url = joinUrlPart(urlObj)
              if (base && !REGEX_HTTP_PROTOCOL.test(url)) {
                url = joinPath(base + '', url)
              }
              console.log(base, url)

              query = { ...param, ...query }
              if (!hasBody && !isEmpty(query)) {
                url = url + '?' + qs.stringify(query)
              }
              const controller = new AbortController()
              timeout = Number(exec.timeout || timeout)
              let isTimeout = false
              let timeoutId = -1
              let timeoutPromise = new Promise((resolve, reject) => {
                if (timeout > 0) {
                  timeoutId = setTimeout(() => {
                    isTimeout = true
                    if (mock) {
                      const abortError = new Error('Aborted due to timeout')
                      abortError.name = 'AbortError'
                      reject(abortError)
                    } else {
                      controller.abort()
                    }
                  }, timeout)
                } else {
                  resolve()
                }
              })
              let init = {
                method,
                signal: controller.signal,
                ...exec,
                headers: {
                  ...headers,
                  ...exec.headers,
                  ...window.ajaxHeader,
                },
                body: hasBody ? JSON.stringify(query) : undefined,
                ...options,
                url,
              }
              beforeRequest(init)
              url = init.url
              let startPromise
              if (start) {
                startPromise = start(store, init)
              }

              return Promise.resolve(startPromise)
                .then(startStore => {
                  if (startStore != null) {
                    Object.assign(store, startStore)
                    model.set(['_store', name], model.of(store))
                  }
                  let promise = mock
                    ? Promise.resolve(
                        isFunction(mock)
                          ? mock()
                          : mock instanceof Response
                          ? mock
                          : new Response(
                              isPOJO(mock) || Array.isArray(mock) ? JSON.stringify(mock) : mock,
                            ),
                      )
                    : abortableFetch(url, init)
                  // console.error(url, init)
                  return Promise.race([timeoutPromise, promise])
                    .then(() => {
                      clearTimeout(timeoutId)
                      return promise
                    })
                    .then(getResponse)
                    .then(res => {
                      afterResponse(res)
                      return onSuccess({
                        response: res,
                        body: res.body,
                        urlParam,
                        param: query,
                        headerParam: init.headers,
                      }).then(() => {
                        return res
                      })
                    })
                    .catch(onFail)
                })
                .catch(onFail)
            })
        },
      }
    }
  }
}

/**
 * Checks if a value is empty.
 */
export function isEmpty(value) {
  if (Array.isArray(value)) {
    return value.length === 0
  } else if (typeof value === 'object') {
    if (value) {
      if (isIterable(value) && value.size !== undefined) {
        throw new Error('isEmpty() does not support iterable collections.')
      }
      for (const _ in value) {
        return false
      }
    }
    return true
  } else {
    return !value
  }
}

export function isIterable(value) {
  if (typeof Symbol === 'undefined') {
    return false
  }
  return value[Symbol.iterator]
}