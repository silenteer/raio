import mergewith from "lodash.mergewith"

function customizer(objValue: any, srcValue: any) {
  if (Array.isArray(objValue)) {
    return objValue.concat(srcValue);
  }

  if (objValue instanceof Map) {
    if (srcValue instanceof Map) {
      srcValue.forEach((value, key) => {
        objValue.set(key, value)
      })
    } else {
      Object.keys(srcValue).forEach(key => objValue.set(key, srcValue[key]))
    }
    return objValue
  }

  if (objValue instanceof Set) {
    if (typeof srcValue.forEach === 'function') {
      srcValue.forEach(value => objValue.add(value))
    } else {
      objValue.add(srcValue)
    }
    return objValue
  }
}

export const merge = (source: any, target: any) => mergewith(source, target, customizer)