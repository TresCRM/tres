# @tres-crm/sdk

Official TypeScript/JavaScript SDK for the TRES CRM API.

## Installation

```bash
npm install @tres-crm/sdk
```

## Quick Start

```typescript
import { TresCrmClient } from "@tres-crm/sdk";

const client = new TresCrmClient({
  baseUrl: "https://your-instance.example.com/api",
  apiKey: "your-api-key",
});

// List tickets
const tickets = await client.tickets.list({ page: 1, limit: 20 });
console.log(tickets.data);

// Create a ticket
const ticket = await client.tickets.create({
  subject: "Login issue",
  description: "User cannot log in after password reset",
  priority: "high",
});

// Close a ticket
await client.tickets.close(ticket._id);
```

## Authentication

All requests require an API key. Pass it when constructing the client:

```typescript
const client = new TresCrmClient({
  baseUrl: "https://your-instance.example.com/api",
  apiKey: "your-api-key",
});
```

The SDK sends the key via the `x-api-key` header on every request.

## Available Methods

### Tickets

| Method | Description |
| --- | --- |
| `client.tickets.list({ page?, limit? })` | List tickets (paginated) |
| `client.tickets.get(id)` | Get a ticket by ID |
| `client.tickets.create(data)` | Create a new ticket |
| `client.tickets.close(id)` | Close a ticket |

### Customers

| Method | Description |
| --- | --- |
| `client.customers.list({ page?, limit? })` | List customers (paginated) |
| `client.customers.get(id)` | Get a customer by ID |
| `client.customers.create(data)` | Create a new customer |

## Error Handling

The SDK throws `TresCrmError` on non-2xx responses:

```typescript
import { TresCrmClient, TresCrmError } from "@tres-crm/sdk";

try {
  await client.tickets.get("nonexistent-id");
} catch (err) {
  if (err instanceof TresCrmError) {
    console.error(err.status); // HTTP status code
    console.error(err.body);   // parsed response body
  }
}
```
