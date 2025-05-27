async function fetchContacts() {
  const res = await fetch('/contacts');
  const data = await res.json();
  const contacts = data.contacts;

  const tbody = document.querySelector('#contacts-table tbody');
  tbody.innerHTML = contacts.map(c => `
    <tr>
      <td>${c.name}</td>
      <td>${c.company || ''}</td>
      <td>${c.email}</td>
      <td>${c.phone || ''}</td>
    </tr>
  `).join('');
}

async function loadUsers() {
  const res = await fetch('/contacts/new');
  const data = await res.json();
  const users = data.users;

  const select = document.getElementById('ownerSelect');
  users.forEach(user => {
    const opt = document.createElement('option');
    opt.value = user._id;
    opt.textContent = user.name;
    select.appendChild(opt);
  });
}

async function createContact(data) {
  const res = await fetch('/contacts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });

  if (res.ok) {
    fetchContacts();
  } else {
    const err = await res.json();
    alert(err.error || err.errors?.map(e => e.msg).join(', ') || 'Error creating contact');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  fetchContacts();
  loadUsers();

  document.getElementById('contactForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const data = {
      owner: form.owner.value,
      name: form.name.value,
      company: form.company.value,
      email: form.email.value,
      phone: form.phone.value
    };
    await createContact(data);
    form.reset();
  });
});
