/**
 * Blood Compatibility Matrix and Matching Engine
 * Accurately determines compatible donors for any recipient blood group.
 */

// Mapping of recipient blood group to eligible donor blood groups
const COMPATIBLE_DONOR_TYPES = {
  'O-': ['O-'],
  'O+': ['O+', 'O-'],
  'A-': ['A-', 'O-'],
  'A+': ['A+', 'A-', 'O+', 'O-'],
  'B-': ['B-', 'O-'],
  'B+': ['B+', 'B-', 'O+', 'O-'],
  'AB-': ['AB-', 'A-', 'B-', 'O-'],
  'AB+': ['AB+', 'AB-', 'A+', 'A-', 'B+', 'B-', 'O+', 'O-'],
  // Special Blood Types
  'A1-': ['A1-', 'A-', 'O-'],
  'A1+': ['A1+', 'A1-', 'A+', 'A-', 'O+', 'O-'],
  'A2-': ['A2-', 'A-', 'O-'],
  'A2+': ['A2+', 'A2-', 'A+', 'A-', 'O+', 'O-'],
  'A1B-': ['A1B-', 'AB-', 'A1-', 'A-', 'B-', 'O-'],
  'A1B+': ['A1B+', 'A1B-', 'AB+', 'AB-', 'A1+', 'A1-', 'A+', 'A-', 'B+', 'B-', 'O+', 'O-'],
  'A2B-': ['A2B-', 'AB-', 'A2-', 'A-', 'B-', 'O-'],
  'A2B+': ['A2B+', 'A2B-', 'AB+', 'AB-', 'A2+', 'A2-', 'A+', 'A-', 'B+', 'B-', 'O+', 'O-'],
  'Bombay Blood Group (Oh / hh)': ['Bombay Blood Group (Oh / hh)'],
};

/**
 * Check if a donor's blood group can be given to recipient
 */
const isBloodCompatible = (donorBlood, recipientBlood) => {
  const eligible = COMPATIBLE_DONOR_TYPES[recipientBlood] || [];
  return eligible.includes(donorBlood);
};

const DONATION_WAITING_PERIOD_DAYS = process.env.DONATION_WAITING_PERIOD_DAYS
  ? parseInt(process.env.DONATION_WAITING_PERIOD_DAYS, 10)
  : 90;

/**
 * Calculate donor donation and cooldown status based on configurable waiting period
 */
const getDonorDonationStatus = (donor, waitingPeriodDays = DONATION_WAITING_PERIOD_DAYS) => {
  if (!donor) return { status: 'Currently Unavailable', isAvailable: false, inCooldown: false };

  if (donor.hasNeverDonated) {
    return {
      status: 'Never Donated',
      isAvailable: donor.isAvailable !== false,
      inCooldown: false,
      label: 'Never Donated (Eligible to Donate)',
    };
  }

  if (donor.lastDonationDate) {
    const lastDate = new Date(donor.lastDonationDate);
    if (!isNaN(lastDate.getTime())) {
      const daysElapsed = Math.floor((Date.now() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
      if (daysElapsed < waitingPeriodDays) {
        const daysRemaining = waitingPeriodDays - daysElapsed;
        return {
          status: 'Currently Unavailable',
          isAvailable: false,
          inCooldown: true,
          daysRemaining,
          daysElapsed,
          label: `Currently Unavailable (Cooldown: ${daysRemaining}d left)`,
        };
      }
    }
  }

  return {
    status: donor.isAvailable === false ? 'Currently Unavailable' : 'Available',
    isAvailable: donor.isAvailable !== false,
    inCooldown: false,
    label: donor.isAvailable === false ? 'Currently Unavailable (Manual Off)' : 'Available',
  };
};

/**
 * Filter matching donors by availability, configurable donation cooldown, and location.
 * NOTE: Blood group restriction is removed so emergency notifications
 * are dispatched to ALL registered and currently available donors.
 */
const filterMatchingDonors = (donors, recipientBlood, recipientCity) => {
  const normalizedCity = (recipientCity || '').trim().toLowerCase();
  const waitingPeriodDays = process.env.DONATION_WAITING_PERIOD_DAYS
    ? parseInt(process.env.DONATION_WAITING_PERIOD_DAYS, 10)
    : 90;

  return donors.filter((donor) => {
    // Donor must be registered as a Donor
    if (donor.userType !== 'Donor') {
      return false;
    }

    // Manual availability check
    if (donor.isAvailable === false) {
      return false;
    }

    // Configurable waiting period / cooldown check
    if (donor.lastDonationDate && !donor.hasNeverDonated) {
      const lastDate = new Date(donor.lastDonationDate);
      if (!isNaN(lastDate.getTime())) {
        const daysElapsed = (Date.now() - lastDate.getTime()) / (1000 * 60 * 60 * 24);
        if (daysElapsed < waitingPeriodDays) {
          // Donor is in mandatory recovery waiting period: currently unavailable
          return false;
        }
      }
    }

    // Blood-group restriction REMOVED: All blood groups are eligible

    // Location match: check if city contains or matches (if city specified)
    if (normalizedCity) {
      const donorCity = (donor.city || '').trim().toLowerCase();
      const isCityMatch =
        !donorCity ||
        donorCity === normalizedCity ||
        donorCity.includes(normalizedCity) ||
        normalizedCity.includes(donorCity);

      if (!isCityMatch) {
        return false;
      }
    }

    return true;
  });
};

// Supported Blood Groups
const NORMAL_BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const SPECIAL_BLOOD_TYPES = [
  'A1+',
  'A1-',
  'A2+',
  'A2-',
  'A1B+',
  'A1B-',
  'A2B+',
  'A2B-',
  'Bombay Blood Group (Oh / hh)',
];
const ALL_VALID_BLOOD_GROUPS = [...NORMAL_BLOOD_GROUPS, ...SPECIAL_BLOOD_TYPES];

module.exports = {
  NORMAL_BLOOD_GROUPS,
  SPECIAL_BLOOD_TYPES,
  ALL_VALID_BLOOD_GROUPS,
  COMPATIBLE_DONOR_TYPES,
  DONATION_WAITING_PERIOD_DAYS,
  getDonorDonationStatus,
  isBloodCompatible,
  filterMatchingDonors,
};

