import React, { useState } from 'react'
import { makeAPI, initModel, getAPIFactoryFromModel } from './util'
// import { Provider, connect } from 'react-redux'
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
    this.options = {
      initData,
      name,
      debug,
      routeMode,
      paramStyle,
      queryKey,
      mockKey,
      edataConfig,
      ajaxConfig,
    }
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
    const {model, apiProps} = (this.model = window.model = this.makeModel(data))

    const reducer = (state, action) => {
      // console.log('reducer', store, action)
    }
    const store = createStore(reducer)

    const {getAPIFromRoute: getAPIProps} = getAPIFactoryFromModel(model)

    function hoc(WrappedComponent) {
      return props => {
        const [now, redraw] = useState(Date.now())
        Object.keys(apiProps).map(apiName => {
          const service = apiProps[apiName]
          for (let name in service) {
            const f = service[name]
            if (typeof f === 'function') {
              service[name] = function (...args) {
                const ret = f.apply(this, args)
                Promise.resolve(ret).then(d => {
                  redraw(Date.now())
                })
                return ret
              }
            }
          }
        })
        return <WrappedComponent {...props} {...apiProps} now={now} />
      }
    }

    // function rootHoc(WrappedComponent) {
    //   return props => (
    //     <Provider store={store}>
    //       <WrappedComponent {...props} />
    //     </Provider>
    //   )
    // }

    // function connectHoc(hocOptions = {}) {
    //   const mapStateToProps = (state, ownProps) => ({})
    //   const mapDispatchToProps = (dispatch, ownProps) => {
    //     const props = getAPIProps()
    //     Object.keys(props).map(apiName => {
    //       const service = props[apiName]
    //       for (let name in service) {
    //         const f = service[name]
    //         if (typeof f === 'function') {
    //           service[name] = function(...args) {
    //             const ret = f.apply(this, args)
    //             Promise.resolve(ret).then(d => {
    //               console.log(d, 999)
    //               dispatch({ type: 'action' })
    //             })
    //             return ret
    //           }
    //         }
    //       }
    //     })
    //     return props
    //   }
    //   return connect(
    //     mapStateToProps,
    //     mapDispatchToProps,
    //     null,
    //     { pure: false },
    //   )
    // }

    this.getAPIProps = getAPIProps
    this.props = apiProps
    this.store = store
    // this.connectHoc = connectHoc
    // this.rootHoc = rootHoc
    this.hoc = hoc

    return this
  }
}

