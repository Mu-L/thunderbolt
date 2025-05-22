# Thunderbolt IMAP Client

A Rust library for interacting with IMAP servers, designed for Thunderbolt.

## Features

- Object-oriented approach with persistent connections
- List mailboxes and message counts
- Fetch messages from inbox or all mailboxes
- Convert mail messages to JSON for easy processing
- Clean text extraction with URL removal

## Usage

```rust
use thunderbolt_imap_client::{ImapClient, ImapCredentials, messages_to_json_values};

// Create credentials
let credentials = ImapCredentials {
    hostname: "imap.example.com".to_string(),
    port: 993,
    username: "user@example.com".to_string(),
    password: "password".to_string(),
};

// Create client
let client = ImapClient::new(credentials);

// List mailboxes
let mailboxes = client.list_mailboxes()?;
for (name, count) in mailboxes.iter() {
    println!("Mailbox: {} - {} messages", name, count);
}

// Fetch inbox messages
let messages = client.fetch_inbox(Some(10))?;
println!("Fetched {} messages from inbox", messages.len());

// Convert messages to JSON
let json_messages = messages_to_json_values(&messages)?;

// Disconnect when done
client.disconnect()?;
```

## Example

See the `examples/test_imap.rs` file for a complete example of using the library.

## Dependencies

- imap 3.0.0-alpha.15
- mail-parser
- serde/serde_json
- anyhow
- regex
