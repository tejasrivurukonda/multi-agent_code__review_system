# 🔍 Code Review Report

## Summary

| Metric | Value |
|--------|-------|
| **Overall Score** | 32/100 |
| **Files Reviewed** | 1 |
| **Critical Issues** | 3 |
| **High Priority Tests** | 11 |
| **Refactoring Opportunities** | 5 |

## 🎯 Top Recommendations

1. 🚨 **Security - SQL Injection**: Fix critical SQL injection vulnerabilities in all three new search functions (searchTodos, searchTodosByStatus, getTodosByUser). User input is directly interpolated into SQL queries without parameterization, allowing attackers to execute arbitrary SQL commands, potentially stealing data, modifying records, or destroying tables. These vulnerabilities must be remediated immediately by using parameterized queries with placeholder values ($1, $2, etc.) instead of string concatenation or template literals.
   - Files: src/todo.ts

2. 🚨 **Testing - Security Functions**: Add comprehensive test coverage for the three new vulnerable functions (searchTodos, searchTodosByStatus, getTodosByUser). These functions have ZERO tests despite containing critical SQL injection vulnerabilities. Tests should verify both normal operation and demonstrate the security flaws with SQL injection attack scenarios. This is essential for security validation and regression prevention after fixes are applied.
   - Files: src/todo.ts

3. ⚠️ **Type Safety**: Fix type mismatch in searchTodosByStatus function. The parameter is typed as string but should be boolean to match the Todo interface and database schema. This type error will cause comparison failures and incorrect query results. Change the signature to accept boolean and update the query to use parameterized queries.
   - Files: src/todo.ts

4. ⚠️ **Testing - Core Business Logic**: Add test coverage for all untested core CRUD operations (createTodo, getAllTodos, getTodoById, updateTodoStatus, deleteTodo). Currently, 0 out of 8 async database operations have tests. These functions handle critical business logic and should have comprehensive tests covering normal operation, error paths, edge cases, and database interactions with mocked dependencies.
   - Files: src/todo.ts

5. ⚠️ **Security - Input Validation**: Add input validation to new search functions. The searchTodos function accepts keywords of any length (potential DoS), and getTodosByUser accepts userIds without format validation. While parameterized queries prevent SQL injection, input validation is still necessary to prevent performance issues, improve error messages, and enforce business rules. Add length limits, null checks, and format validation.
   - Files: src/todo.ts

## Full Findings

### `src/todo.ts`

Quality score: **25/100** | Estimated coverage: **15%** | Tests found: src/todo.test.ts

#### Code Quality Issues (9)

This file contains three critical SQL injection vulnerabilities in the newly added search functions (searchTodos, searchTodosByStatus, getTodosByUser) that allow attackers to execute arbitrary SQL commands. These must be fixed immediately by using parameterized queries. Additional issues include weak random ID generation using Math.random() instead of cryptographically secure methods, missing input validation, and a type mismatch in searchTodosByStatus. The existing functions (createTodo, getTodoById, etc.) demonstrate proper security practices with parameterized queries, which should be applied to the new functions.

- **[CRITICAL]** `src/todo.ts:119` (security): SQL injection vulnerability in searchTodos function. User-supplied keyword is directly interpolated into the SQL query using template literals without parameterization or sanitization. An attacker can inject arbitrary SQL by providing input like: ' OR '1'='1' -- to bypass the search and extract all data, or use UNION attacks to extract data from other tables.
  - Fix: Use parameterized queries with placeholder values: const query = 'SELECT * FROM todos WHERE title LIKE $1 OR description LIKE $1'; const rows = await db.query(query, [`%${keyword}%`]);
- **[CRITICAL]** `src/todo.ts:128` (security): SQL injection vulnerability in searchTodosByStatus function. The completed parameter is concatenated directly into the SQL query without validation or parameterization. An attacker can inject SQL by providing input like: '1 OR 1=1 --' or '1; DROP TABLE todos; --' to manipulate the query or execute destructive commands.
  - Fix: Use parameterized queries and validate that completed is a boolean: if (typeof completed !== 'boolean' && completed !== 'true' && completed !== 'false') {   throw new Error('Invalid completed value'); } const isCompleted = completed === true || completed === 'true'; const sql = 'SELECT * FROM todos WHERE completed = $1'; const rows = await db.query(sql, [isCompleted]);
- **[CRITICAL]** `src/todo.ts:137` (security): SQL injection vulnerability in getTodosByUser function. The userId is directly interpolated into a SQL query with a JOIN clause using template literals. An attacker can inject SQL commands through the userId parameter, potentially accessing unauthorized data or modifying the database. Example attack: ' OR '1'='1' UNION SELECT * FROM users --
  - Fix: Use parameterized queries: const query = 'SELECT t.* FROM todos t JOIN user_todos ut ON t.id = ut.todo_id WHERE ut.user_id = $1'; const rows = await db.query(query, [userId]);
- **[HIGH]** `src/todo.ts:127` (bug-risk): Type mismatch in searchTodosByStatus function. The parameter is typed as string but the database field 'completed' is likely a boolean. This will cause comparison failures and incorrect query results. The function signature accepts string but should handle boolean values properly.
  - Fix: Change the function signature and add proper type conversion: export async function searchTodosByStatus(completed: boolean): Promise<Todo[]> {   const query = 'SELECT * FROM todos WHERE completed = $1';   const rows = await db.query(query, [completed]);   return rows as Todo[]; }
- **[MEDIUM]** `src/todo.ts:148` (security): Weak random ID generation using Math.random(). The generateId function uses Math.random() which is not cryptographically secure and can produce collisions. For a todo application this creates a medium risk of ID prediction or collision, potentially allowing unauthorized access to other users' todos.
  - Fix: Use crypto.randomUUID() for secure unique IDs: import { randomUUID } from 'crypto';  function generateId(): string {   return randomUUID(); } // Or if you need the prefix: function generateId(): string {   return `todo_${randomUUID()}`; }
- **[MEDIUM]** `src/todo.ts:119` (security): Missing input validation in searchTodos function. The keyword parameter has no length validation or sanitization before use. While parameterized queries prevent SQL injection, extremely long keywords could cause performance issues or denial of service.
  - Fix: Add input validation: export async function searchTodos(keyword: string): Promise<Todo[]> {   if (!keyword || keyword.trim().length === 0) {     return [];   }   if (keyword.length > 100) {     throw new Error('Search keyword too long');   }   const sanitized = keyword.trim();   const query = 'SELECT * FROM todos WHERE title LIKE $1 OR description LIKE $1';   const rows = await db.query(query, [`%${sanitized}%`]);   return rows as Todo[]; }
- **[MEDIUM]** `src/todo.ts:137` (security): Missing input validation in getTodosByUser function. The userId parameter is not validated for format or length before use in the query, which could lead to performance issues with malformed inputs even after fixing the SQL injection.
  - Fix: Add validation: export async function getTodosByUser(userId: string): Promise<Todo[]> {   if (!userId || userId.trim().length === 0) {     throw new Error('User ID is required');   }   if (userId.length > 50) {     throw new Error('Invalid user ID format');   }   const query = 'SELECT t.* FROM todos t JOIN user_todos ut ON t.id = ut.todo_id WHERE ut.user_id = $1';   const rows = await db.query(query, [userId]);   return rows as Todo[]; }
- **[LOW]** `src/todo.ts:82` (bug-risk): Missing error handling in getAllTodos function. If the database query fails, the error will propagate up without context. While not incorrect, adding try-catch with meaningful error messages improves debugging and error reporting.
  - Fix: Add error handling: export async function getAllTodos(): Promise<Todo[]> {   try {     const query = 'SELECT * FROM todos ORDER BY created_at DESC';     const rows = await db.query(query);     return rows as Todo[];   } catch (error) {     throw new Error(`Failed to fetch todos: ${error.message}`);   } }
- **[LOW]** `src/todo.ts:91` (maintainability): Inconsistent return type handling in getTodoById. The function returns null when no todo is found, but other functions like getAllTodos return empty arrays. Consider standardizing the pattern across the codebase for consistency.
  - Fix: Document the null return or consider throwing a NotFoundError for better error handling: export async function getTodoById(id: string): Promise<Todo | null> {   if (!id || id.trim().length === 0) {     return null;   }   const query = 'SELECT * FROM todos WHERE id = $1';   const rows = await db.query(query, [id]);   return rows.length === 0 ? null : rows[0] as Todo; }

#### Test Coverage Gaps (14)

Only 2 of 11 functions are tested (validateTodoInput and sanitizeInput), covering ~18% of the codebase. The three newly added functions (searchTodos, searchTodosByStatus, getTodosByUser) contain intentional SQL injection vulnerabilities and have ZERO test coverage, which is critical since they handle user input insecurely. None of the async database operations are tested, and no error paths or edge cases are covered for the core CRUD operations. The estimate of 15% reflects that only basic input validation is tested while all business logic, database interactions, and the vulnerable search functions remain completely untested.

- **[CRITICAL]** function at searchTodos (line 117): This function contains an intentional SQL injection vulnerability using direct string interpolation in SQL queries. It handles user input (keyword) without sanitization and is a critical security risk. No tests exist to verify the vulnerability or document expected behavior.
  - Suggested test: it('executes SQL injection when malicious keyword is provided') - call searchTodos("'; DROP TABLE todos; --") and verify the query string contains the unescaped input, demonstrating the vulnerability. Also add: it('returns matching todos for valid keyword') - call searchTodos('groceries') with a mocked database returning [{id: '1', title: 'Buy groceries', description: 'test', completed: false, createdAt: new Date()}] and expect(result).toEqual([{id: '1', title: 'Buy groceries', description: 'test', completed: false, createdAt: expect.any(Date)}]).
- **[CRITICAL]** function at searchTodosByStatus (line 126): This function contains an intentional SQL injection vulnerability using string concatenation without validation. The completed parameter is concatenated directly into SQL, allowing arbitrary SQL execution. No tests exist to demonstrate this critical security flaw.
  - Suggested test: it('executes SQL injection when malicious completed value is provided') - call searchTodosByStatus("1; DELETE FROM todos") and verify the query contains the unescaped input. Also add: it('returns completed todos when completed is true') - mock db.query to return [{id: '1', title: 'Test', description: '', completed: true, createdAt: new Date()}], call searchTodosByStatus('true'), and expect(result).toEqual([{id: '1', title: 'Test', description: '', completed: true, createdAt: expect.any(Date)}]).
- **[CRITICAL]** function at getTodosByUser (line 135): This function contains an intentional SQL injection vulnerability using template literals without sanitization. The userId parameter is directly interpolated into a JOIN query, exposing the user_todos relationship table to SQL injection attacks.
  - Suggested test: it('executes SQL injection when malicious userId is provided') - call getTodosByUser("' OR '1'='1") and verify the query string contains the unescaped input demonstrating the vulnerability. Also add: it('returns todos for valid user') - mock db.query to return [{id: '1', title: 'User Todo', description: 'test', completed: false, createdAt: new Date()}], call getTodosByUser('user123'), and expect(result).toEqual([{id: '1', title: 'User Todo', description: 'test', completed: false, createdAt: expect.any(Date)}]).
- **[HIGH]** function at createTodo (line 51): Core business logic that creates todos in the database. No tests verify database interaction, error handling when validation fails, or that the function properly sanitizes input before storing. Missing tests for async behavior and database errors.
  - Suggested test: it('creates a todo with valid input') - mock db.query, call createTodo({title: 'Test', description: 'Description'}), verify db.query was called with correct parameterized query and expect(result).toMatchObject({title: '&lt;Test&gt;' if sanitized, description: 'Description', completed: false}). Also add: it('throws error for invalid input') - call createTodo({title: '', description: 'test'}) and expect it to throw Error('Invalid todo input').
- **[HIGH]** function at getAllTodos (line 78): Core business logic that retrieves all todos. No tests verify the database query, ordering by created_at DESC, or handling of empty results.
  - Suggested test: it('returns all todos ordered by creation date descending') - mock db.query to return [{id: '2', title: 'Second', description: '', completed: false, createdAt: new Date('2024-01-02')}, {id: '1', title: 'First', description: '', completed: false, createdAt: new Date('2024-01-01')}], call getAllTodos() and expect(result).toEqual([{id: '2', ...}, {id: '1', ...}]). Also add: it('returns empty array when no todos exist') - mock db.query to return [], call getAllTodos() and expect(result).toEqual([]).
- **[HIGH]** function at getTodoById (line 87): Core business logic for retrieving a specific todo. No tests verify parameterized query usage, null return for non-existent IDs, or successful retrieval of existing todos.
  - Suggested test: it('returns todo when id exists') - mock db.query to return [{id: 'todo_123', title: 'Test', description: 'desc', completed: false, createdAt: new Date()}], call getTodoById('todo_123') and expect(result).toEqual({id: 'todo_123', title: 'Test', description: 'desc', completed: false, createdAt: expect.any(Date)}). Also add: it('returns null when id does not exist') - mock db.query to return [], call getTodoById('nonexistent') and expect(result).toBeNull().
- **[HIGH]** function at updateTodoStatus (line 101): Core business logic that modifies todo state. No tests verify the parameterized query, handling of non-existent IDs, or successful status updates.
  - Suggested test: it('updates todo completed status') - mock db.query, call updateTodoStatus('todo_123', true), and verify db.query was called with 'UPDATE todos SET completed = $1 WHERE id = $2' and params [true, 'todo_123']. Also add: it('updates todo to incomplete') - mock db.query, call updateTodoStatus('todo_123', false), and verify db.query was called with params [false, 'todo_123'].
- **[HIGH]** function at deleteTodo (line 109): Core business logic that permanently removes data. No tests verify the parameterized query or handling of non-existent IDs. Deletion is a critical operation that should be thoroughly tested.
  - Suggested test: it('deletes todo by id') - mock db.query, call deleteTodo('todo_123'), and verify db.query was called with 'DELETE FROM todos WHERE id = $1' and params ['todo_123']. Also add: it('does not throw error when deleting non-existent todo') - mock db.query to succeed, call deleteTodo('nonexistent') and verify it completes without error.
- **[MEDIUM]** edge-case at validateTodoInput (line 25): Existing tests do not cover whitespace-only title input, null/undefined description, or title with exactly 200 characters (boundary case).
  - Suggested test: it('returns false for whitespace-only title') - call validateTodoInput({title: '   ', description: 'test'}) and expect(result).toBe(false). Also add: it('returns true for title with exactly 200 characters') - call validateTodoInput({title: 'a'.repeat(200), description: 'test'}) and expect(result).toBe(true). Also add: it('returns true when description is undefined') - call validateTodoInput({title: 'Valid', description: undefined}) and expect(result).toBe(true).
- **[MEDIUM]** edge-case at sanitizeInput (line 41): Existing tests do not cover empty string input, mixed special characters in one string, or strings with no special characters.
  - Suggested test: it('returns empty string for empty input') - call sanitizeInput('') and expect(result).toBe(''). Also add: it('handles mixed special characters') - call sanitizeInput('<div>"test" & \'value\'</div>') and expect(result).toBe('&lt;div&gt;&quot;test&quot; & &#039;value&#039;&lt;/div&gt;'). Also add: it('returns unchanged string with no special characters') - call sanitizeInput('normal text 123') and expect(result).toBe('normal text 123').
- **[CRITICAL]** edge-case at searchTodos (line 117): No tests for empty keyword, null/undefined keyword, special characters in keyword, or keyword with no matches.
  - Suggested test: it('returns empty array when keyword is empty string') - mock db.query to return [], call searchTodos('') and expect(result).toEqual([]). Also add: it('returns empty array when no todos match keyword') - mock db.query to return [], call searchTodos('nonexistent') and expect(result).toEqual([]). Also add: it('handles special SQL characters in keyword') - call searchTodos("%'; DROP TABLE todos; --") and verify the malicious input is directly interpolated showing the vulnerability.
- **[CRITICAL]** edge-case at searchTodosByStatus (line 126): No tests for invalid completed values (not 'true'/'false'), empty string, or non-boolean string values.
  - Suggested test: it('handles non-boolean string values') - call searchTodosByStatus('invalid') and verify the query is malformed or produces SQL error. Also add: it('handles empty string for completed parameter') - call searchTodosByStatus('') and verify behavior. Also add: it('returns all completed todos') - mock db.query to return 2 completed todos, call searchTodosByStatus('1') and expect(result.length).toBe(2).
- **[CRITICAL]** edge-case at getTodosByUser (line 135): No tests for empty userId, non-existent userId, or userId with special SQL characters.
  - Suggested test: it('returns empty array when user has no todos') - mock db.query to return [], call getTodosByUser('user_with_no_todos') and expect(result).toEqual([]). Also add: it('handles empty userId string') - call getTodosByUser('') and verify behavior. Also add: it('handles SQL injection characters in userId') - call getTodosByUser("' UNION SELECT * FROM users --") and verify the malicious input is directly interpolated demonstrating the vulnerability.
- **[LOW]** function at generateId (line 145): Private utility function with no direct tests. Should verify ID uniqueness and proper format with 'todo_' prefix.
  - Suggested test: it('generates unique IDs with todo_ prefix') - call generateId() twice and verify both results start with 'todo_' and are different strings. Use expect(id1).toMatch(/^todo_\d+_[a-z0-9]{7}$/) and expect(id1).not.toBe(id2).

#### Refactoring Suggestions (5)

The file shows good structure overall with consistent async/await usage and parameterized queries in the original functions. The main refactoring opportunities are: (1) extracting the duplicated query-execution pattern from the three new search functions into a reusable helper, and (2) modernizing validation and sanitization logic with optional chaining and functional patterns. The searchTodosByStatus function has a type mismatch that should be corrected.

**extract-function** at searchTodos, searchTodosByStatus, getTodosByUser (lines 119-145) (impact: high)

Extract duplicated query execution pattern into a reusable helper function. All three new search functions follow the same pattern: build query, execute, return typed results.

Before:

~~~
export async function searchTodos(keyword: string): Promise<Todo[]> {
  const query = `SELECT * FROM todos WHERE title LIKE '%${keyword}%' OR description LIKE '%${keyword}%'`;
  const rows = await db.query(query);
  return rows as Todo[];
}

export async function searchTodosByStatus(completed: string): Promise<Todo[]> {
  const sql = "SELECT * FROM todos WHERE completed = " + completed;
  const rows = await db.query(sql);
  return rows as Todo[];
}

export async function getTodosByUser(userId: string): Promise<Todo[]> {
  const query = `SELECT t.* FROM todos t JOIN user_todos ut ON t.id = ut.todo_id WHERE ut.user_id = '${userId}'`;
  const rows = await db.query(query);
  return rows as Todo[];
}
~~~

After:

~~~
async function executeQuery<T>(query: string, params?: unknown[]): Promise<T[]> {
  const rows = await db.query(query, params);
  return rows as T[];
}

export async function searchTodos(keyword: string): Promise<Todo[]> {
  const query = 'SELECT * FROM todos WHERE title LIKE $1 OR description LIKE $1';
  return executeQuery<Todo>(query, [`%${keyword}%`]);
}

export async function searchTodosByStatus(completed: boolean): Promise<Todo[]> {
  const query = 'SELECT * FROM todos WHERE completed = $1';
  return executeQuery<Todo>(query, [completed]);
}

export async function getTodosByUser(userId: string): Promise<Todo[]> {
  const query = 'SELECT t.* FROM todos t JOIN user_todos ut ON t.id = ut.todo_id WHERE ut.user_id = $1';
  return executeQuery<Todo>(query, [userId]);
}
~~~

Benefits: Reduces duplication, centralizes query execution logic, makes it easier to add logging/monitoring, and the parameterized version shown here would also eliminate SQL injection vulnerabilities (though security is not this agent's focus).

**simplify** at validateTodoInput function (lines 27-38) (impact: medium)

Simplify validation logic using early returns and combine related checks. The current structure has unnecessary nesting.

Before:

~~~
export function validateTodoInput(input: CreateTodoInput): boolean {
  if (!input.title || input.title.trim().length === 0) {
    return false;
  }
  if (input.title.length > 200) {
    return false;
  }
  if (input.description && input.description.length > 1000) {
    return false;
  }
  return true;
}
~~~

After:

~~~
export function validateTodoInput(input: CreateTodoInput): boolean {
  const trimmedTitle = input.title?.trim();
  
  if (!trimmedTitle || trimmedTitle.length === 0 || trimmedTitle.length > 200) {
    return false;
  }
  
  if (input.description?.length > 1000) {
    return false;
  }
  
  return true;
}
~~~

Benefits: Uses optional chaining for cleaner null checks, reduces redundant title checking, and makes the validation logic more concise while maintaining readability.

**modernize** at sanitizeInput function (lines 43-49) (impact: low)

Use a configuration object with array-based replacements for better maintainability and extensibility.

Before:

~~~
export function sanitizeInput(input: string): string {
  return input
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
~~~

After:

~~~
export function sanitizeInput(input: string): string {
  const replacements: Array<[RegExp, string]> = [
    [/</g, '&lt;'],
    [/>/g, '&gt;'],
    [/"/g, '&quot;'],
    [/'/g, '&#039;']
  ];
  
  return replacements.reduce(
    (result, [pattern, replacement]) => result.replace(pattern, replacement),
    input
  );
}
~~~

Benefits: Makes it easier to add or modify escape rules, improves testability by separating data from logic, and demonstrates functional programming patterns with reduce.

**pattern-improvement** at createTodo function (lines 54-75) (impact: medium)

Use destructuring and object spread to simplify todo object creation and reduce intermediate variables.

Before:

~~~
export async function createTodo(input: CreateTodoInput): Promise<Todo> {
  if (!validateTodoInput(input)) {
    throw new Error('Invalid todo input');
  }

  const sanitizedTitle = sanitizeInput(input.title.trim());
  const sanitizedDescription = sanitizeInput(input.description || '');

  const todo: Todo = {
    id: generateId(),
    title: sanitizedTitle,
    description: sanitizedDescription,
    completed: false,
    createdAt: new Date()
  };

  const query = 'INSERT INTO todos (id, title, description, completed, created_at) VALUES ($1, $2, $3, $4, $5)';
  const params = [todo.id, todo.title, todo.description, todo.completed, todo.createdAt];

  await db.query(query, params);

  return todo;
}
~~~

After:

~~~
export async function createTodo(input: CreateTodoInput): Promise<Todo> {
  if (!validateTodoInput(input)) {
    throw new Error('Invalid todo input');
  }

  const todo: Todo = {
    id: generateId(),
    title: sanitizeInput(input.title.trim()),
    description: sanitizeInput(input.description || ''),
    completed: false,
    createdAt: new Date()
  };

  const query = 'INSERT INTO todos (id, title, description, completed, created_at) VALUES ($1, $2, $3, $4, $5)';
  const params = [todo.id, todo.title, todo.description, todo.completed, todo.createdAt];

  await db.query(query, params);

  return todo;
}
~~~

Benefits: Eliminates unnecessary intermediate variables (sanitizedTitle, sanitizedDescription), makes the code more declarative, and reduces cognitive load by keeping related logic together in the object literal.

**modernize** at searchTodosByStatus parameter type (line 127) (impact: medium)

Change parameter type from string to boolean to match the completed field type in the Todo interface and provide type safety.

Before:

~~~
export async function searchTodosByStatus(completed: string): Promise<Todo[]> {
  const sql = "SELECT * FROM todos WHERE completed = " + completed;
  const rows = await db.query(sql);
  return rows as Todo[];
}
~~~

After:

~~~
export async function searchTodosByStatus(completed: boolean): Promise<Todo[]> {
  const query = 'SELECT * FROM todos WHERE completed = $1';
  const rows = await db.query(query, [completed]);
  return rows as Todo[];
}
~~~

Benefits: Provides compile-time type checking, prevents invalid string values, matches the Todo interface definition, and improves API clarity for consumers of this function.

---

*Generated at 2026-10-29T09:02:14.476Z • Duration: 238822ms*
