class DeltaGenerator
  getRandomString = (alphabet, length) ->
    return _.map([0..(length - 1)], ->
      return alphabet[_.random(0, alphabet.length - 1)]
    ).join('')

  getRandomLength = ->
    rand = Math.random()
    if rand < 0.6
      return _.random(1, 2)
    else if rand < 0.8
      return _.random(3, 4)
    else if rand < 0.9
      return _.random(5, 9)
    else
      return _.random(10, 50)

  insertAt = (delta, insertionPoint, insertions) ->
    charIndex = opIndex = 0
    for op in delta.ops
      break if charIndex == insertionPoint
      if insertionPoint < charIndex + op.getLength()
        [head, tail] = op.split(insertionPoint - charIndex)
        delta.ops.splice(opIndex, 1, head, tail)
        opIndex++
        break
      charIndex += op.getLength()
      opIndex++
    delta.ops.splice(opIndex, 0, new InsertOp(insertions))
    delta.endLength += insertions.length
    delta.compact()

  deleteAt = (delta, deletionPoint, numToDelete) ->
    charIndex = 0
    ops = []
    for op in delta.ops
      if numToDelete > 0 && (charIndex == deletionPoint or deletionPoint < charIndex + op.getLength())
        curDelete = Math.min(numToDelete, op.getLength() - (deletionPoint - charIndex))
        numToDelete -= curDelete
        if Delta.isInsert(op)
          newText = op.value.substring(0, deletionPoint - charIndex) + op.value.substring(deletionPoint - charIndex + curDelete)
          ops.push(new InsertOp(newText)) if newText.length > 0
        else
          console.assert(Delta.isRetain(op), "Expected retain but got: #{op}")
          head = new RetainOp(op.start, op.start + deletionPoint - charIndex, _.clone(op.attributes))
          tail = new RetainOp(op.start + deletionPoint - charIndex + curDelete, op.end, _.clone(op.attributes))
          ops.push(head) if head.start < head.end
          ops.push(tail) if tail.start < tail.end
        deletionPoint += curDelete
      else
        ops.push(op)
      charIndex += op.getLength()
    delta.ops = ops
    delta.endLength = _.reduce(ops, (length, op) ->
      return length + op.getLength()
    , 0)

  addRandomOp = (newDelta, startDelta) ->
    finalIndex = startDelta.endLength - 1
    opIndex = _.random(0, finalIndex)
    rand = Math.random()
    if rand < 0.5
      opLength = getRandomLength()
      insertAt(newDelta, opIndex, getRandomString(alphabet, opLength))
    else if rand < 0.75
      opLength = _.random(1, finalIndex - index)
      deleteAt(newDelta, opIndex, opLength)
    else
      opLength = _.random(1, finalIndex - index)
      formatAt(newDelta, opIndex, opLength)
    return newDelta

  @getRandomDelta: (startDelta, alphabet, format) ->
    newDelta = new Delta(startDelta.startLength,
                         startDelta.endLength,
                         [new RetainOp(startDelta.endLength,
                                       startelta.endLength)])
    numChanges = _.random(1, 10)
    for i in [0...numChanges]
      addRandomOp(newDelta, startDelta)
    return newDelta