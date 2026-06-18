// FILE: src/utils/generateEmployeeId.js
// PURPOSE: Auto-generate employee ID from name + DOB (same logic as RegisterPage.jsx)

const generateEmployeeId = (name, dob) => {
  const initials = name.trim().split(" ").map(n => n[0].toUpperCase()).join("");
  const year     = dob ? new Date(dob).getFullYear().toString().slice(-2) : "00";
  const rand     = Math.floor(100 + Math.random() * 900);
  return `EMP${initials}${year}${rand}`;
};

module.exports = generateEmployeeId;