import React, { useState } from 'react'
import { makeAPI, initModel } from './util'
import { Provider, connect } from 'react-redux'
import { createStore } from 'redux'

export default class EdataRouterClass {
  constructor({
    initData = {},
    name,
    debug = false,
    routeMode = 'hash',
    paramStyle = 'simple',
    queryKey = 'param',
    mockKey = 'mock',
    edataConfig,
    ajaxConfig,
  } = {}) {
    this.data = initData
    this.name = name
    this.routeMode = routeMode
    this.makeModel = initModel(edataConfig, {
      ajaxSetting: ajaxConfig,
      debug,
      paramStyle,
      queryKey,
      mockKey,
    })
  }
  model(modelActions, modelObject) {
    if (typeof modelActions === 'function') {
      modelActions(this.data)
    } else {
      // makeAPI({name: '_global', ...modelActions}, modelObject)(this.data)
      makeAPI({ ...modelActions }, modelObject)(this.data)
    }
  }
  route(routes) {
    this.routes = routes
  }
  run(options = {}) {
    const { data } = this
    const model = (this.model = window.model = this.makeModel(data))

    const allAPI = Object.keys((model.get(['_api']) || {}).value || {})
    const reducer = (state, action) => {
      // console.log('reducer', store, action)
    }
    const store = createStore(reducer)

    function expandAPINameItem(val) {
      let names = [val]
      if (val instanceof RegExp) {
        names = allAPI.filter(v => val.test(v))
      }
      if (val === '*') {
        names = allAPI
      }
      return names
    }

    function getAPIProps({ api = ['*'] } = {}) {
      const props = {}
      // const apiObj = model.unwrap(['_api', '_global']) || {}
      // Object.keys(apiObj).forEach((key) => {
      //   props[key] = model.unwrap(['_api', '_global', key])
      // })
      // props.store = model.unwrap(['_store', '_global']) || {}

      api.forEach(val => {
        const names = expandAPINameItem(val)
        names.filter(Boolean).forEach(name => {
          const services = {}
          props[name] = services
          const apiObj = (model.get(['_api', name]) || {}).value || {}
          Object.keys(apiObj).forEach(key => {
            services[key] = model.unwrap(['_api', name, key])
          })
          services.store = model.unwrap(['_store', name]) || {}
        })
      })
      return props
    }

    function hoc(WrappedComponent) {
      return props => {
        const [now, redraw] = useState(Date.now())
        const apiProps = getAPIProps()
        Object.keys(apiProps).map(apiName => {
          const service = apiProps[apiName]
          for (let name in service) {
            const f = service[name]
            if (typeof f === 'function') {
              service[name] = function(...args) {
                const ret = f.apply(this, args)
                Promise.resolve(ret).then(d => {
                  console.log(d, 999)
                  redraw(Date.now())
                })
                return ret
              }
            }
          }
        })
        console.log(now, 88383)
        return <WrappedComponent {...props} {...apiProps} now={now} />
      }
    }

    function rootHoc(WrappedComponent) {
      return props => (
        <Provider store={store}>
          <WrappedComponent {...props} />
        </Provider>
      )
    }

    function connectHoc(hocOptions = {}) {
      const mapStateToProps = (state, ownProps) => ({})
      const mapDispatchToProps = (dispatch, ownProps) => {
        const props = getAPIProps()
        Object.keys(props).map(apiName => {
          const service = props[apiName]
          for (let name in service) {
            const f = service[name]
            if (typeof f === 'function') {
              service[name] = function(...args) {
                const ret = f.apply(this, args)
                Promise.resolve(ret).then(d => {
                  console.log(d, 999)
                  dispatch({ type: 'action' })
                })
                return ret
              }
            }
          }
        })
        return props
      }
      return connect(
        mapStateToProps,
        mapDispatchToProps,
        null,
        { pure: false },
      )
    }

    this.allAPI = allAPI
    this.getAPIProps = getAPIProps
    this.apiProps = getAPIProps()
    this.store = store
    this.connectHoc = connectHoc
    this.rootHoc = rootHoc
    this.hoc = hoc

    return this
  }
}

