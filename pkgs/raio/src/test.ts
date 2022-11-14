const a = () => {}
a.name = 'xyz'
a['meta'] = { file: 'abc' }

function b() {}
b.name = 'zyx'
b['meta'] = { file: 'cba' }

console.log(a, b)
console.log(a.name, b.name)
console.log(a['meta'], b['meta'])