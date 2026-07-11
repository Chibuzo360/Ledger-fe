const currentDayDate = (dateFormat) => {
  const time = new Date();

  const year = time.getFullYear();
  const month = time.getMonth();
  const day = time.getDate();

  const months = [
    "January",
    "Febuary",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];

  const currentMonth = months[month];
  const dateFormat1 = `${currentMonth} ${day}, ${year}`;
  const dateFormat2 = `${day}/${month}/${year}`;

  switch (dateFormat) {
    case 1:
      return dateFormat1;
      break;
    case 2:
      return dateFormat2;
      break;
    default:
      return dateFormat1
      break;
  }
};

export default currentDayDate;
