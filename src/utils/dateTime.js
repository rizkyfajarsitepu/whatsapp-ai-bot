const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

function pad(num) {
  return String(num).padStart(2, '0');
}

export function getWIBTimestamp(date = new Date()) {
  const wib = new Date(date.getTime() + WIB_OFFSET_MS);

  const day = pad(wib.getUTCDate());
  const month = pad(wib.getUTCMonth() + 1);
  const year = wib.getUTCFullYear();
  const hours = pad(wib.getUTCHours());
  const minutes = pad(wib.getUTCMinutes());
  const seconds = pad(wib.getUTCSeconds());

  return {
    date: `${day}-${month}-${year}`,
    time: `${hours}-${minutes}-${seconds}`,
    dateTime: `${day}-${month}-${year}_${hours}-${minutes}-${seconds}`,
  };
}