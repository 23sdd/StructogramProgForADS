export const examples = [
  {
    id: 'insertion', title: 'Insertion sort', description: 'ADS I · p. 20',
    source: `insertionSort(A : T[n])
  for i := 1 to n − 1
    if A[i−1] > A[i]
      x := A[i]
      A[i] := A[i−1]
      j := i − 2
      while j ≥ 0 ∧ A[j] > x
        A[j+1] := A[j]
        j := j − 1
      A[j+1] := x
    else
      SKIP`
  },
  {
    id: 'search', title: 'BST search', description: 'ADS I · p. 54',
    source: `search(t : Node*; k : T) : Node*
  while t ≠ ∅ ∧ t→key ≠ k
    if k < t→key
      t := t→left
    else
      t := t→right
  return t`
  },
  {
    id: 'traversal', title: 'Tree traversals', description: 'ADS I · binary trees',
    source: `preorder(t : Node*)
  if t ≠ ∅
    process(t)
    preorder(t→left)
    preorder(t→right)

inorder(t : Node*)
  if t ≠ ∅
    inorder(t→left)
    process(t)
    inorder(t→right)

postorder(t : Node*)
  if t ≠ ∅
    postorder(t→left)
    postorder(t→right)
    process(t)`
  },
  {
    id: 'insert', title: 'BST insertion', description: 'ADS I · p. 54',
    source: `insert(&t : Node*; k : T)
  if t = ∅
    t := new Node(k)
  else
    select
      case k < t→key
        insert(t→left, k)
      case k > t→key
        insert(t→right, k)
      case k = t→key
        SKIP`
  },
  {
    id: 'bfs', title: 'Breadth-first search', description: 'ADS II · Graphs, p. 15',
    source: `BFS(G : G; s : V)
  for u ∈ G.V
    d(u) := ∞; π(u) := ∅
  d(s) := 0
  Q : Queue; Q.add(s)
  while ¬Q.isEmpty()
    u := Q.rem()
    for v ∈ G.A(u)
      if d(v) = ∞
        d(v) := d(u) + 1
        π(v) := u
        Q.add(v)
      else
        SKIP`
  },
  {
    id: 'balances', title: 'Fill AVL balances', description: 'ADS II · practice AVL-7, worked example',
    source: `fillBalances(t : Node*) : Z
  if t = ∅
    return −1
  else
    leftHeight := fillBalances(t→left)
    rightHeight := fillBalances(t→right)
    t→b := rightHeight − leftHeight
    return 1 + max(leftHeight, rightHeight)`
  }
];

export const blank = { title: 'Untitled algorithm', source: 'algorithm(A : T[n])\n  SKIP' };
