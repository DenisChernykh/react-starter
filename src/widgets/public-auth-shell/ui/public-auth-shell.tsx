import type { ReactNode } from 'react'

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Container,
} from '@/shared/ui'

type PublicAuthShellProps = Readonly<{
  title: string
  description?: string
  children: ReactNode
  footer?: ReactNode
}>

export function PublicAuthShell({
  title,
  description,
  children,
  footer,
}: PublicAuthShellProps) {
  return (
    <Container
      as="main"
      className="flex min-h-screen items-center justify-center py-6"
    >
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>
            <h1>{title}</h1>
          </CardTitle>
          {description !== undefined && (
            <CardDescription>{description}</CardDescription>
          )}
        </CardHeader>
        <CardContent>{children}</CardContent>
        {footer !== undefined && <CardFooter>{footer}</CardFooter>}
      </Card>
    </Container>
  )
}
