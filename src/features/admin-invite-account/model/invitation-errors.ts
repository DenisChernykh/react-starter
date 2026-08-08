type InvitationField = 'email' | 'roleKeys'

type ValidationProblem = Readonly<{
  errors?: ReadonlyArray<Readonly<{ pointer: string; detail: string }>>
}>

const fieldByPointer: Readonly<Record<string, InvitationField>> = {
  '/email': 'email',
  '/roleKeys': 'roleKeys',
}

export function mapInvitationValidationErrors(problem: ValidationProblem) {
  const result: Partial<Record<InvitationField, string>> = {}
  for (const error of problem.errors ?? []) {
    const field = fieldByPointer[error.pointer]
    if (field !== undefined && result[field] === undefined) {
      result[field] = error.detail
    }
  }
  return result
}
