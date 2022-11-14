import mergewith from "lodash.mergewith"

function customizer(objValue: any, srcValue: any) {
  if (Array.isArray(objValue)) {
    return objValue.concat(srcValue);
  }
}

export const merge = (source: any, target: any) => mergewith(source, target, customizer)